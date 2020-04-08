/* eslint-disable */
import { argv } from 'yargs';
import root from './utils/root';
import runGulp from './runGulp';
import runWebpack from './runWebpack';

async function main() {
  await runGulp(argv);
  runWebpack(argv);
}

process.chdir(root());
main();
