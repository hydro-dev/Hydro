import path from 'path';
import { size } from '@hydrooj/utils/lib/utils';
import cac from 'cac';
import chalk from 'chalk';
import fs from 'fs-extra';
import { globbySync } from 'globby';
import webpack, { Stats } from 'webpack';
import WebpackDevServer from 'webpack-dev-server';
import webpackConfig from './config/webpack';
import root from './utils/root';

const argv = cac().parse();

async function runWebpack({
  watch, production, measure, dev, https,
}) {
  const compiler = webpack(await webpackConfig({ watch, production, measure }));
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
      if (!watch && (!stats || stats.hasErrors())) {
        if (!argv.options.detail) console.log(stats.toString());
        process.exitCode = 1;
      }
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
        .replace(/\.[a-f0-9]{6}\.worker\./, '.worker.')
        .replace(/\.[a-f0-9]{6}\.e\.js/, '.e.js');
      stats[key] = data.size;
    }
    const statsPath = root('__bundleInfo');
    let oldTotal = 0;
    let newTotal = 0;
    if (fs.existsSync(statsPath)) {
      console.log('Compare to last production bundle:');
      const oldStats = JSON.parse(await fs.readFile(statsPath, 'utf-8')) as Record<string, number>;
      for (const key in stats) oldStats[key] ||= 0;
      const entries: [filename: string, orig: number, curr: number][] = [];
      for (const [key, value] of Object.entries(oldStats)) {
        oldTotal += value;
        newTotal += stats[key] || 0;
        if (Math.abs((stats[key] || 0) - value) > 25) entries.push([key, value, stats[key] || 0]);
      }
      const sorted = entries.sort((i) => i[1] - i[2]);
      sorted.push(['Total', oldTotal, newTotal]);
      for (const entry of sorted) {
        const [name, orig, curr] = entry;
        const diff = 100 * (curr - orig) / orig;
        if (Math.abs(diff) < 0.01 && name !== 'Total') continue;
        const color = orig > curr ? chalk.green : chalk.red;
        console.log(color(`${name.padStart(35)} ${size(orig).padStart(10)} -> ${size(curr).padEnd(10)} (${diff.toPrecision(5)}%)`), chalk.reset());
      }
    }
    await fs.writeFile(statsPath, JSON.stringify(stats));
  }
}

async function main() {
  const dir = process.cwd();
  process.chdir(root());
  if (argv.options.iconfont) {
    const { default: svgtofont } = await import('svgtofont');
    await svgtofont({
      src: root('misc/icons'),
      dist: root('misc/.iconfont'),
      styleTemplates: root('misc/icons/template'),
      classNamePrefix: 'icon',
      fontName: 'hydro-icons',
      css: true,
      startUnicode: 0xEA01,
      svg2ttf: {
        timestamp: 1577836800, // 2020-1-1
      },
      svgicons2svgfont: {
        fontHeight: 1000,
        descent: 6.25 / 100 * 1000,
        normalize: true,
      },
    });
  } else {
    await runWebpack(argv.options as any);
    await Promise.all(globbySync('public/**/*.map').map((i) => fs.remove(i)));
  }
  process.chdir(dir);
}

module.exports = main;
