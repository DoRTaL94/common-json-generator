const config = require('config');
const { expect } = require('chai');
const fs = require('fs');


describe('Configuration test', () => {
  let envVars;
  const envs = ['development', 'ci', 'staging', 'prod-qa', 'production', 'testing'];
  const setEnvVars = () => {
    envVars = fs
    .readFileSync(`result/string/${process.env.NODE_ENV}.string`, { encoding: 'utf-8' })
    .replace(/\r?\n|\r/, '')
    .replace(/\\\\\\"/g, '"')
    .split(' ');
    envVars.pop();
    envVars.map(str => {
      const res = str.split('=', 2);
      return [ res[0], res[1] ];
    });
    envVars.forEach(pair => process.env[pair[0]] = pair[1]);
  }

  afterEach(() => {
    envVars.forEach(pair => delete process.env[pair[0]]);
  });

  for (let env of envs) {
    it(`${env} environment test`, () => {
      process.env.NODE_ENV = env;
      setEnvVars();
      const result = config.util.loadFileConfigs('result/json');
      const expected = config.util.loadFileConfigs('source');
      expect(result).to.deep.equal(expected);
    });
  }
});
