/* eslint-disable import/no-extraneous-dependencies */
import { argv } from 'yargs';
import root from './utils/root';
import runGulp from './runGulp';
import runWebpack from './runWebpack';

async function main() {
  const dir = process.cwd();
  process.chdir(root());
  await runGulp(argv);
  await runWebpack(argv);
  process.chdir(dir);
}

module.exports = main;
