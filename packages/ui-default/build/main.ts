/* eslint-disable import/no-import-module-exports */
/* eslint-disable import/no-extraneous-dependencies */
import cac from 'cac';
import chalk from 'chalk';
import log from 'fancy-log';
import fs from 'fs-extra';
import gulp from 'gulp';
import webpack from 'webpack';
import WebpackDevServer from 'webpack-dev-server';
import pkg from '../package.json';
import gulpConfig from './config/gulp';
import webpackConfig from './config/webpack';
import root from './utils/root';

const argv = cac().parse();

async function runWebpack({
  watch, production, measure, dev,
}) {
  const compiler = webpack(webpackConfig({ watch, production, measure }));
  if (dev) {
    const server = new WebpackDevServer({
      port: 8000,
      compress: true,
      hot: true,
      proxy: {
        context: (path) => path !== '/ws',
        target: 'http://localhost:2333',
        ws: true,
      },
    }, compiler);
    return server.start();
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
      resolve(null);
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
      if (Object.values(taskList).filter((b) => b).length === 0) resolve(null);
    });
    gulpTasks.default();
  });
}

async function main() {
  const dir = process.cwd();
  process.chdir(root());
  if (argv.options.gulp) await runGulp();
  else {
    await runWebpack(argv.options as any);
    if (fs.existsSync('public/hydro.js')) {
      fs.copyFileSync('public/hydro.js', `public/hydro-${pkg.version}.js`);
    }
    if (fs.existsSync('public/polyfill.js')) {
      fs.copyFileSync('public/polyfill.js', `public/polyfill-${pkg.version}.js`);
    }
    if (fs.existsSync('public/default.theme.css')) {
      fs.copyFileSync('public/default.theme.css', `public/default-${pkg.version}.theme.css`);
    }
    if (argv.options.production) {
      fs.removeSync('public/vditor/dist/js/echarts');
      fs.removeSync('public/vditor/dist/js/graphviz');
      fs.removeSync('public/vditor/dist/js/mermaid');
      const files = fs.readdirSync('public');
      files.filter((i) => /(^[in]\..+|worker)\.js\.map$/.test(i)).forEach((i) => fs.removeSync(`public/${i}`));
    }
  }
  process.chdir(dir);
}

module.exports = main;
