#!/usr/bin/env node

/* eslint-disable consistent-return */

const map = {};
require('source-map-support').install({
    handleUncaughtExceptions: false,
    environment: 'node',
    retrieveSourceMap(file) {
        if (map[file]) {
            return {
                url: file,
                map: map[file],
            };
        }
        return null;
    },
});
const path = require('path');
const vm = require('vm');
const fs = require('fs-extra');
const esbuild = require('esbuild');
const { default: hook } = require('require-resolve-hook');
const { bypass } = hook(/^(hydrooj|@hydrooj\/utils)/, (id) => bypass(() => require.resolve(id)));

if (!process.env.NODE_APP_INSTANCE) process.env.NODE_APP_INSTANCE = '0';
const major = +process.version.split('.')[0].split('v')[1];
const minor = +process.version.split('.')[1];

function transform(filename) {
    const code = fs.readFileSync(filename, 'utf-8');
    const result = esbuild.transformSync(code, {
        sourcefile: filename,
        sourcemap: 'both',
        format: 'cjs',
        loader: 'tsx',
        target: `node${major}.${minor}`,
        jsx: 'transform',
    });
    if (result.warnings.length) console.warn(result.warnings);
    map[filename] = result.map;
    return result.code;
}
const ESM = ['p-queue', 'p-timeout'];
const _script = new vm.Script('"Hydro"', { produceCachedData: true });
const bytecode = (_script.createCachedData && _script.createCachedData.call)
    ? _script.createCachedData()
    : _script.cachedData;
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
require.extensions['.jsc'] = function loader(module, filename) {
    const buf = fs.readFileSync(filename);
    bytecode.slice(12, 16).copy(buf, 12);
    if (![12, 13, 14, 15, 16, 17].filter((i) => process.version.startsWith(`v${i}`)).length) {
        bytecode.slice(16, 20).copy(buf, 16);
    }
    // eslint-disable-next-line no-return-assign
    const length = buf.slice(8, 12).reduce((sum, number, power) => sum += number * (256 ** power), 0);
    let dummyCode = '';
    if (length > 1) dummyCode = `"${'\u200b'.repeat(length - 2)}"`;
    const script = new vm.Script(dummyCode, {
        filename,
        lineOffset: 0,
        displayErrors: true,
        cachedData: buf,
    });
    if (script.cachedDataRejected) throw new Error(`cacheDataRejected on ${filename}`);
    const compiledWrapper = script.runInThisContext({
        filename,
        lineOffset: 0,
        columnOffset: 0,
        displayErrors: true,
    });
    const dirname = path.dirname(filename);
    const args = [module.exports, require, module, filename, dirname, process, global];
    return compiledWrapper.apply(module.exports, args);
};

require('./commands');
