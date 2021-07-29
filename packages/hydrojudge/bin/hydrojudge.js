#!/usr/bin/env node

const argv = require('cac')().parse();
const esbuild = require('esbuild');

let transformTimeUsage = 0;
let displayTimeout;
function transform(type, filename) {
    const start = new Date();
    const result = esbuild.buildSync({
        entryPoints: [filename],
        sourcemap: 'inline',
        platform: 'node',
        format: 'cjs',
        target: `node${process.version.split('.')[0].split('v')[1]}`,
        jsx: 'transform',
        write: false,
    });
    if (result.warnings.length) console.warn(result.warnings);
    transformTimeUsage += new Date().getTime() - start.getTime();
    if (displayTimeout) clearTimeout(displayTimeout);
    displayTimeout = setTimeout(() => console.log(`Code transform took ${transformTimeUsage}ms`), 1000);
    return result.outputFiles[0].text;
}
require.extensions['.ts'] = function loader(module, filename) {
    return module._compile(transform('ts', filename), filename);
};
require.extensions['.tsx'] = function loader(module, filename) {
    return module._compile(transform('tsx', filename), filename);
};

if (argv.options.debug) process.env.DEV = 'on';
if (argv.args[0] === 'cache') require('../src/cache')();
else require('../src/daemon')();
