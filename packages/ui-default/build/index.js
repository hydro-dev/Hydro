const esbuild = require('esbuild');
const fs = require('fs');

function transform(filename) {
  const result = esbuild.buildSync({
    entryPoints: [filename],
    sourcemap: 'inline',
    platform: 'node',
    format: 'cjs',
    target: 'node12',
    jsx: 'transform',
    write: false,
  });
  if (result.warnings.length) console.warn(result.warnings);
  return result.outputFiles[0].text;
}
require.extensions['.js'] = function loader(module, filename) {
  if (filename.includes('chalk') || (!filename.includes('node_modules') && !filename.includes('postcss.config.js'))) {
    return module._compile(transform(filename), filename);
  }
  const content = fs.readFileSync(filename, 'utf-8');
  return module._compile(content, filename);
};
require.extensions['.ts'] = function loader(module, filename) {
  return module._compile(transform(filename), filename);
};
const main = require('./main');

if (!module.parent) main();
