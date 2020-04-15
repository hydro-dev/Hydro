/* eslint-disable import/no-extraneous-dependencies */
import fs from 'fs';
import webpack from 'webpack';
import root from './utils/root';
import webpackConfig from './config/webpack';

export default function ({ watch, production }) {
  const compiler = webpack(webpackConfig({ watch, production }));

  function compilerCallback(err, stats) {
    if (err) {
      console.error(err.stack || err);
      if (err.details) console.error(err.details);
      process.exit(1);
    }
    fs.writeFileSync(root('./.webpackStats.json'), JSON.stringify(stats.toJson(), null, 2));
    if (!watch && stats.hasErrors()) process.exitCode = 1;
  }

  if (watch) compiler.watch({}, compilerCallback);
  else compiler.run(compilerCallback);
}
