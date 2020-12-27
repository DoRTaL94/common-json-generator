const ConfigsGenerator = require('./ConfigsGenerator');


const option = process.argv[2];
const sourcePath = `${__dirname}/source`;
const destPath = `${__dirname}/result`;
const filesToIgnore = [
  'default.json',
  'custom-environment-variables.json',
  'common.json'
];
const generator = new ConfigsGenerator(destPath, sourcePath, filesToIgnore);

if(option === 'generate') {
  generator.generateConfigs();
} else if (option === 'clean-result') {
  generator.clean({ result: true });
} else if (option === 'clean-source') {
  generator.clean({ source: true });
} else if (option === 'clean-both') {
  generator.clean({ result: true, source: true });
} else {
  console.log('Please pass as an argument one of this options:');
  console.log('1. generate');
  console.log('2. clean-result');
  console.log('3. clean-source');
  console.log('4. clean-both');
}
