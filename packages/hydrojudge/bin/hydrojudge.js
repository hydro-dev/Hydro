#!/usr/bin/env node

const argv = require('cac')().parse();
const esbuild = require('esbuild');
const fs = require('fs-extra');

const major = +process.version.split('.')[0].split('v')[1];
const minor = +process.version.split('.')[1];

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
        target: `node${major}.${minor}`,
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
const ESM = ['p-queue', 'p-timeout'];
require.extensions['.js'] = function loader(module, filename) {
    if (ESM.filter((i) => filename.includes(i)).length || major < 14) {
        return module._compile(transform(filename), filename);
    }
    const content = fs.readFileSync(filename, 'utf-8');
    return module._compile(content, filename);
};
require.extensions['.ts'] = require.extensions['.tsx'] = function loader(module, filename) {
    return module._compile(transform(filename), filename);
};

if (argv.options.debug) process.env.DEV = 'on';
if (argv.args[0] === 'cache') require('../src/cache')();
else require('../src/daemon')();
