/* eslint-disable import/no-import-module-exports */
import { size } from '@hydrooj/utils/lib/utils';
import cac from 'cac';
import chalk from 'chalk';
import log from 'fancy-log';
import fs from 'fs-extra';
import { globbySync } from 'globby';
import gulp from 'gulp';
import { sum } from 'lodash';
import path from 'path';
import webpack, { Stats } from 'webpack';
import WebpackDevServer from 'webpack-dev-server';
import pkg from '../package.json';
import gulpConfig from './config/gulp';
import webpackConfig from './config/webpack';
import root from './utils/root';

const argv = cac().parse();

async function runWebpack({
  watch, production, measure, dev, https,
}) {
  const compiler = webpack(webpackConfig({ watch, production, measure }));
  if (dev) {
    const server = new WebpackDevServer({
      port: https ? 8001 : 8000,
      compress: true,
      hot: true,
      server: https ? 'https' : 'http',
      allowedHosts: 'all',
      proxy: [{
        context: (p) => p !== '/ws',
        target: 'http://localhost:2333',
        ws: true,
      }],
      client: {
        webSocketURL: 'auto://0.0.0.0:0/ws',
      },
    }, compiler);
    server.start();
    return;
  }
  const res = await new Promise<Stats>((resolve, reject) => {
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
      resolve(stats);
    }
    if (watch) compiler.watch({}, compilerCallback);
    else compiler.run(compilerCallback);
  });
  if (production && res && !res.hasErrors()) {
    const stats = {};
    const files = fs.readdirSync(root('public'), { withFileTypes: true });
    for (const file of files) {
      if (!file.isFile() || file.name.endsWith('.map')) continue;
      const data = await fs.stat(path.join(root('public'), file.name));
      const key = file.name
        .replace(/\.[a-f0-9]{6}\.chunk\./, '.chunk.')
        .replace(/\.[a-f0-9]{6}\.worker\./, '.worker.');
      stats[key] = data.size;
    }
    const statsPath = root('__bundleInfo');
    if (fs.existsSync(statsPath)) {
      log('Compare to last production bundle:');
      const oldStats = JSON.parse(await fs.readFile(statsPath, 'utf-8')) as Record<string, number>;
      for (const key in stats) oldStats[key] ||= 0;
      const entries: [filename: string, orig: number, curr: number][] = [];
      for (const [key, value] of Object.entries(oldStats)) {
        if (Math.abs((stats[key] || 0) - value) > 25) entries.push([key, value, stats[key] || 0]);
      }
      const sorted = entries.sort((i) => i[1] - i[2]);
      sorted.push(['Total', sum(sorted.map((i) => i[1])), sum(sorted.map((i) => i[2]))]);
      for (const entry of sorted) {
        const [name, orig, curr] = entry;
        const diff = 100 * (curr - orig) / orig;
        if (Math.abs(diff) < 0.01 && name !== 'Total') continue;
        const color = orig > curr ? chalk.green : chalk.red;
        log(color(`${name.padStart(35)} ${size(orig).padStart(10)} -> ${size(curr).padEnd(10)} (${diff.toPrecision(5)}%)`), chalk.reset());
      }
    }
    await fs.writeFile(statsPath, JSON.stringify(stats));
  }
}

async function runGulp() {
  function errorHandler(err) {
    log(chalk.red('Error: %s'), chalk.reset(err.toString() + err.stack));
    process.exit(1);
  }
  const gulpTasks = gulpConfig({ errorHandler });
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
    if (fs.existsSync('public/theme.css')) {
      fs.copyFileSync('public/theme.css', `public/theme-${pkg.version}.css`);
    }
    if (argv.options.production) {
      for (const f of ['echarts', 'graphviz', 'mermaid', 'mathjax']) {
        fs.removeSync(`public/vditor/dist/js/${f}`);
      }
      const files = fs.readdirSync('public');
      files.filter((i) => /(^[in]\..+|worker)\.js\.map$/.test(i)).forEach((i) => fs.removeSync(`public/${i}`));
    }
    await Promise.all(globbySync('public/**/*.map').map((i) => fs.remove(i)));
  }
  process.chdir(dir);
}

module.exports = main;
