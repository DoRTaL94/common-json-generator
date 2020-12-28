const fs = require('fs');
const path = require('path');
const config = require('config');


class ConfigsGenerator {
  constructor(dest, source, filesNamesToIgnore = []) {
    this.dest = dest;
    this.source = source;
    this.filesNamesToIgnore = filesNamesToIgnore;
  }

  /**
   * Removes the content of "result" or "source" folder or both.
   * @param {*} options 1. result: When true cleans the "result" folder
   * 2. source: When true cleans the "source" folder
   */
  clean(options = {}) {
    if (options.result) {
      this._cleanHelper(this.dest);
    }

    if (options.source) {
      this._cleanHelper(this.source);
    }
  }

  /**
   * Generates new configs without the properties that common to all of them.
   * That properties are added to the "default.json" config.
   * Additionally, a new config file is created named "custom-environment-variable.json",
   * which holds all the properties that are not in the "default" config and that are in the other configs.
   */
  generateConfigs() {
    this._createDirs();
    this._readFiles(this.source)
    .then(files => {
      console.log('Loaded ', files.length, ' files');
      const configs = this._loadConfigs(files);
      const common = this._getCommonJson(configs);

      this._writeData(common, 'default', 'json');
      this._generateFilesWithoutCommon(configs, common);
      this._generateCustomEnvironmentVariablesJson();
    })
    .catch(error => console.log(error));
  }

  _loadConfigs(files) {
    const configs = [];

    files.forEach(file => {
      const env = file.filename.split('.')[0];
      process.env.NODE_ENV = env;

      configs.push({
        filename: `${env}.json`,
        contents: JSON.stringify(config.util.loadFileConfigs('source'))
      });
    });

    return configs;
  }

  _cleanHelper(dirPath) {
    fs.rmdir(dirPath, { recursive: true }, err => {
      if (err) {
        console.log(err);
      } else {
        console.log('Directory cleaned: ', dirPath);
        fs.mkdir(dirPath, err => {
          if (err) {
            console.log(err);
          }
        });
      }
    });
  }

  _createDirs() {
    const jsonDir = `${this.dest}/json`;
    const yamlDir = `${this.dest}/yaml`;
    const strDir = `${this.dest}/string`;

    this._createDir(this.dest);
    this._createDir(jsonDir);
    this._createDir(yamlDir);
    this._createDir(strDir);
  }

  _createDir(path) {
    if (!fs.existsSync(path)) {
      fs.mkdir(path, err => {
        if (err) {
          console.log(err);
        }
      });
    }
  }

  _generateCustomEnvironmentVariablesJson() {
    this._readFiles(`${this.dest}/json`)
    .then(files => {
      const newDefault = JSON.parse(this._findFile(files, 'default.json').contents);
      let customEnvironmentVariables = {};

      for(let i = 0; i < files.length; i++) {
        const file = files[i];
        
        if (!this.filesNamesToIgnore.includes(file.filename)) {
          const fileObj = JSON.parse(file.contents);
          const diff = this._different(fileObj, newDefault);
          const diffWithTreeConventionValues = this._changeValuesToTreeConvention(diff);
          const filenameWithoutSuffix = file.filename.split('.')[0];
          const keyValueObj = this._createKeyValueObject(diff, diffWithTreeConventionValues);

          this._createKeyValueYaml(keyValueObj, filenameWithoutSuffix);
          this._createEnvVarStrForTesting(keyValueObj, filenameWithoutSuffix);
          customEnvironmentVariables = this._union(customEnvironmentVariables, diffWithTreeConventionValues);
        }
      }

      this._writeData(customEnvironmentVariables, 'custom-environment-variables', 'json');
    })
    .catch(error => console.log(error))
  }

  _writeData(data, fileName, suffix = 'string') {
    const toJson = suffix === 'json' && data instanceof Object || fileName.split('.').length === 2 && fileName.split('.')[1] === 'json';
    const content = toJson ? JSON.stringify(data, null, 2) : data;
    const filePath = `${this.dest}/${suffix}/${fileName}.${suffix}`;
    fs.writeFileSync(filePath, `${content}\n`);
    console.log(`Generated new file: ${filePath}`);
  }

  _changeValuesToTreeConvention(obj, path = '', separator = '') {
    if (Array.isArray(obj)) {
      return { '__name': path, '__format': 'json' }
    } else if (typeof obj === 'string') {
        return path;
    } else if (typeof obj !== 'object') {
      return { '__name': path, '__format': `${typeof obj}` }
    } else {
      const cloneObj = JSON.parse(JSON.stringify(obj));

      for (const prop in obj) {
        cloneObj[prop] = this._changeValuesToTreeConvention(obj[prop], `${path}${separator}${prop}`, '_');
      }

      return cloneObj;
    }
  }

  _createKeyValueYaml(keyValueObj, filename) {
    let keyValueString = '';

    for(const key in keyValueObj) {
      keyValueString += `${key}: ${keyValueObj[key]}\n`;
    }

    this._writeData(keyValueString, filename, 'yaml');
  }

  _createEnvVarStrForTesting(keyValueObj, filename) {
    let keyValueString = '';

    for(const key in keyValueObj) {
      keyValueString += `${key}=${keyValueObj[key]} `;
    }

    this._writeData(
      keyValueString
        .replace(/"/g, '\\\\\\"')
        .replace(/'/g, '')
        .replace(/{{/g, '{')
        .replace(/}}/g, '}'),
      filename
    );
  }

  _createKeyValueObject(objectWithValues, objectWithKeys) {
    let res = {};

    if (!(objectWithValues instanceof Object) || Array.isArray(objectWithValues)) {
      let value  = JSON.stringify(objectWithValues);

      if(value[0] === '"') {
        value = value.substring(1, value.length - 1);
      }

      value = value.replace(/{/g, '{{').replace(/}/g, '}}');
      res[objectWithKeys.__name || objectWithKeys] = `'${value}'`;
    } else {
      for (const prop in objectWithKeys) {
        const keyValueObj = this._createKeyValueObject(objectWithValues[prop], objectWithKeys[prop]);
        res = this._union(res, keyValueObj);
      }
    }

    return res;
  }

  _findFile(files, name) {
    let i = 0;

    while(i < files.length && files[i].filename !== name) {
      i++;
    }

    return files[i];
  }

  _promiseAll(items, block) {
    const promises = [];

    items.forEach(function(item, index) {
      promises.push(function(item, i) {
        return new Promise(function(resolve, reject) {
          return block.apply(this, [ item, index, resolve, reject ]);
        });
      }(item, index))
    });

    return Promise.all(promises);
  }

  _readFiles(sourcePath) {
    const self = this;
    return new Promise((resolve, reject) => {
      fs.readdir(sourcePath, function(err, filenames) {
        if (err) {
          return reject(err);
        }

        self._promiseAll(filenames, (filename, index, resolve, reject) =>  {
          fs.readFile(path.resolve(sourcePath, filename), 'utf-8', function(err, content) {
            if (err) {
              return reject(err);
            }
            return resolve({filename: filename, contents: content});
          });
        })
        .then(results => resolve(results))
        .catch(error => reject(error));
      });
    });
  }

  _getCommonJson(files) {
    let res = JSON.parse(files[0].contents);

    for(let i = 1; i < files.length; i++) {
      if (!this.filesNamesToIgnore.includes(files[i].filename)) {
        const currentFile = JSON.parse(files[i].contents);
        res = this._intersect(res, currentFile);
      }
    }

    return res;
  }

  _generateFilesWithoutCommon(files, common) {
    for(let i = 0; i < files.length; i++) {
      if (!this.filesNamesToIgnore.includes(files[i].filename)) {
        let currentFile = JSON.parse(files[i].contents);
        currentFile = this._different(currentFile, common);
        this._writeData(currentFile, files[i].filename.split('.')[0], 'json');
      }
    }
  }

  _union(dest, source, handleConflict = (destObj, sourceObject) => destObj instanceof Object ? destObj : sourceObject) {
    if (!(dest instanceof Object) || !(source instanceof Object)) {
      return handleConflict(dest, source);
    }

    let cloneDest = JSON.parse(JSON.stringify(dest));

    for (const prop in source) {
      if (dest[prop]  ned) {
        cloneDest[prop] = this._union(cloneDest[prop], source[prop]);
      } else {
        cloneDest[prop] = source[prop];
      }
    }

    return cloneDest;
  }

  _different(dest, source) {
    if (!(dest instanceof Object) || !(source instanceof Object)) {
      return dest === source ? null : dest;
    }

    let cloneDest = JSON.parse(JSON.stringify(dest));

    for (const prop in source) {
      if (dest[prop] !== undefined) {
        cloneDest[prop] = this._different(cloneDest[prop], source[prop]);

        if (cloneDest[prop] === null) {
          delete cloneDest[prop];
        }
      }
    }

    return Object.keys(cloneDest).length === 0 ? null : cloneDest;
  }

  _intersect(dest, source) {
    if (!(dest instanceof Object) || !(source instanceof Object)) {
      return dest === source ? dest : null;
    }

    let cloneDest = JSON.parse(JSON.stringify(dest));

    for (const prop in dest) {
      if (source[prop] !== undefined) {
        cloneDest[prop] = this._intersect(cloneDest[prop], source[prop]);

        if (cloneDest[prop] === null) {
          delete cloneDest[prop];
        }
      } else {
        delete cloneDest[prop];
      }
    }

    return Object.keys(cloneDest).length === 0 ? null : cloneDest;
  }
}

module.exports = ConfigsGenerator;
