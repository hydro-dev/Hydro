/* eslint-disable import/no-extraneous-dependencies */
import cac from 'cac';
import fs from 'fs-extra';
import webpack from 'webpack';
import esbuild from 'esbuild';
import WebpackDevServer from 'webpack-dev-server';
import gulp from 'gulp';
import log from 'fancy-log';
import chalk from 'chalk';
import pkg from '../package.json';
import root from './utils/root';
import gulpConfig from './config/gulp';
import webpackConfig from './config/webpack';

const argv = cac().parse();

async function runWebpack({
  watch, production, measure, dev,
}) {
  const result = esbuild.build({
    bundle: true,
    format: 'iife',
    entryPoints: [root('sharedworker.ts')],
    outfile: root('.build/sharedworker.js'),
    watch: dev || watch,
    minify: production,
  });
  if (!dev && !watch) await result;
  const compiler = webpack(webpackConfig({ watch, production, measure }));
  if (dev) {
    const server = new WebpackDevServer(compiler, {
      compress: true,
      hot: true,
      disableHostCheck: true,
      stats: 'none',
      index: root('public'),
      proxy: {
        context: (path) => !path.includes('sharedworker.js'),
        target: 'http://localhost:2333',
        ws: true,
      },
    });
    return server.listen(8000);
  }
  return new Promise((resolve, reject) => {
    function compilerCallback(err, stats) {
      if (err) {
        console.error(err.stack || err);
        if (err.details) console.error(err.details);
        if (!watch && (!stats || stats.hasErrors())) process.exitCode = 1;
        reject(err);
        return;
      }
      if (argv.options.detail) console.log(stats.toString());
      if (!watch && (!stats || stats.hasErrors())) process.exitCode = 1;
      resolve();
    }
    if (watch) compiler.watch({}, compilerCallback);
    else compiler.run(compilerCallback);
  });
}

async function runGulp() {
  function handleError(err) {
    log(chalk.red('Error: %s'), chalk.reset(err.toString() + err.stack));
    process.exit(1);
  }
  const gulpTasks = gulpConfig({ production: true, errorHandler: handleError });
  return new Promise((resolve) => {
    const taskList = {};

    gulp.on('start', ({ uid, name }) => {
      log(chalk.blue('Starting task: %s'), chalk.reset(name));
      taskList[uid] = true;
    });
    gulp.on('stop', ({ uid, name }) => {
      log(chalk.green('Finished: %s'), chalk.reset(name));
      taskList[uid] = false;
      if (Object.values(taskList).filter((b) => b).length === 0) resolve();
    });
    gulpTasks.default();
  });
}

async function main() {
  const dir = process.cwd();
  process.chdir(root());
  await runGulp();
  await runWebpack(argv.options);
  if (fs.existsSync('public/hydro.js')) {
    fs.copyFileSync('public/hydro.js', `public/hydro-${pkg.version}.js`);
  }
  if (argv.options.production) {
    fs.removeSync('public/vditor/dist/js/mathjax');
    fs.removeSync('public/vditor/dist/js/echarts');
    fs.removeSync('public/vditor/dist/js/graphviz');
    fs.removeSync('public/vditor/dist/js/mermaid');
    fs.removeSync('public/vditor/dist/js/abcjs');
  }
  process.chdir(dir);
}

module.exports = main;
