/* eslint-disable node/no-deprecated-api */
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
const fs = require('fs');
const esbuild = require('esbuild');

process.env.NODE_APP_INSTANCE ||= '0';
const major = +process.version.split('.')[0].split('v')[1];
const minor = +process.version.split('.')[1];

const remove = [
    // by esbuild
    /(const|let|var)\s+__filename\s*=\s*fileURLToPath\s*\(\s*import\.meta\.url\s*\)\s*;?/g,
    /(const|let|var)\s+__dirname\s*=\s*(path\.)?dirname\s*\(\s*__filename\s*\)\s*;?/g,
    // by tsdown
    /(const|let|var)\s+getFilename\s*=\s*\(\s*\)\s*=>\s*fileURLToPath\s*\(\s*import\.meta\.url\s*\)\s*;?/g,
    /(const|let|var)\s+__filename\s*=\s*(?:(\/\*\s*@__PURE__\s*\*\/)\s*)?getFilename\s*\(\s*\)\s*;?/g,
];
function tryTransform(filename, content, tsx = true) {
    for (const regex of remove) content = content.replace(regex, '');
    return esbuild.transformSync(content, {
        tsconfigRaw: '{"compilerOptions":{"experimentalDecorators":true}}',
        sourcefile: filename,
        sourcemap: 'both',
        format: 'cjs',
        loader: tsx ? 'tsx' : 'ts',
        target: `node${major}.${minor}`,
        jsx: 'transform',
    });
}

function transform(filename, tsx = true) {
    const code = fs.readFileSync(filename, 'utf-8');
    let result;
    try {
        result = tryTransform(filename, code, tsx);
    } catch (e) {
        if (!e.message.includes('Top-level await')) throw e;
        result = tryTransform(filename, code.replace(/await import *\(/g, 'require('), tsx);
        console.warn('transforming top-level await to require for file ', filename);
    }
    if (result.warnings.length) console.warn(result.warnings);
    map[filename] = result.map;
    if (process.env.LOADER_DUMP_CODE && filename.endsWith(`/${process.env.LOADER_DUMP_CODE}`)) {
        console.log(`-----${filename}-----`);
        console.log(result.code.split('/# sourceMappingURL=')[0]);
    }
    return result.code;
}
const _script = new vm.Script('"Hydro"', { produceCachedData: true });
const bytecode = (_script.createCachedData && _script.createCachedData.call)
    ? _script.createCachedData()
    : _script.cachedData;
require.extensions['.js'] = function loader(module, filename) {
    if (major < 14) {
        return module._compile(transform(filename), filename);
    }
    try {
        const content = fs.readFileSync(filename, 'utf-8');
        const lastLine = content.trim().split('\n').pop();
        if (lastLine.startsWith('//# sourceMappingURL=data:application/json;base64,')) {
            const info = lastLine.split('//# sourceMappingURL=data:application/json;base64,')[1];
            const payload = JSON.parse(Buffer.from(info, 'base64').toString());
            map[filename] = payload;
        }
        return module._compile(content, filename);
    } catch (e) { // ESM
        return module._compile(transform(filename), filename);
    }
};
require.extensions['.ts'] = function loader(module, filename) {
    return module._compile(transform(filename, false), filename);
};
require.extensions['.tsx'] = require.extensions['.jsx'] = function loader(module, filename) {
    return module._compile(transform(filename), filename);
};
require.extensions['.jsc'] = function loader(module, filename) {
    const buf = fs.readFileSync(filename);
    bytecode.subarray(12, 16).copy(buf, 12);
    if (![12, 13, 14, 15, 16, 17].filter((i) => process.version.startsWith(`v${i}`)).length) {
        bytecode.subarray(16, 20).copy(buf, 16);
    }

    const length = buf.subarray(8, 12).reduce((sum, number, power) => sum += number * (256 ** power), 0);
    let dummyCode = '';
    if (length > 1) dummyCode = `"${'\u200B'.repeat(length - 2)}"`;
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

const debug = process.argv.find((i) => i.startsWith('--debug'));
if (debug && !['0', 'false', 'off', 'disabled', 'no'].includes(debug.split('=')[1]?.toLowerCase())) {
    console.log('Debug mode enabled');
    process.env.NODE_ENV = 'development';
    process.env.DEV = 'on';
} else process.env.NODE_ENV ||= 'production';
