const esbuild = require('esbuild');
const fs = require('fs');

let transformTimeUsage = 0;
let transformCount = 0;
let displayTimeout;
function transform(filename) {
  const start = new Date();
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
  transformTimeUsage += new Date().getTime() - start.getTime();
  transformCount++;
  if (displayTimeout) clearTimeout(displayTimeout);
  displayTimeout = setTimeout(() => console.log(`Transformed ${transformCount} files. (${transformTimeUsage}ms)`), 1000);
  return result.outputFiles[0].text;
}
require.extensions['.js'] = function loader(module, filename) {
  if (!filename.includes('node_modules') && !filename.includes('postcss.config.js')) {
    return module._compile(transform(filename), filename);
  }
  const content = fs.readFileSync(filename, 'utf-8');
  return module._compile(content, filename);
};
require.extensions['.ts'] = function loader(module, filename) {
  return module._compile(transform(filename), filename);
};
const main = require('./main.js');

if (!module.parent) main();
