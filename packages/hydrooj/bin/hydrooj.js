#!/usr/bin/env node
require('@hydrooj/register');

const packageBasedir = require('path').resolve(__dirname, '..');
const { homedir } = require('os');
const { default: hook } = require('@undefined-moe/require-resolve-hook');
const { bypass } = hook(/^(hydrooj|@hydrooj|cordis|lodash|js-yaml)($|\/)/, (id) => {
    if (id.startsWith('hydrooj/src') && !('__DISABLE_HYDRO_DEPRECATION_WARNING__' in global)) {
        if (process.env.DEV) {
            const error = new Error(`module require via ${id} is deprecated.`);
            const filter = [
                'node:diagnostics', 'node:internal',
                '_resolveFilename', 'ignoreModuleNotFoundError',
                'framework/register', '@hydrooj/register',
            ];
            error.stack = error.stack.split('\n')
                .filter((i) => !filter.some((f) => i.includes(f)))
                .join('\n');
            console.error(error);
        } else {
            console.warn('Module require via %s is deprecated.', id);
        }
    }
    if (id.startsWith('hydrooj')) {
        return bypass(() => require.resolve(id, { paths: [packageBasedir] }));
    }
    return bypass(() => {
        try {
            return require.resolve(id);
        } catch (_) {
            try {
                return require.resolve(id, { paths: [`${process.cwd()}/node_modules`] });
            } catch (e) {
                try {
                    return require.resolve(id.replace(/^@hydrooj\//, './'), { paths: [`${homedir()}/.hydro/addons`] });
                } catch (er) {
                    return id;
                }
            }
        }
    });
}, { ignoreModuleNotFoundError: false });

Error.stackTraceLimit = 50;

// Replace pnp paths.
// Vscode will try to open a local file for links, so this doesn't work for remote-ssh, etc.
if (process.env.npm_execpath && !process.env.SSH_CONNECTION) {
    const original = Error.prepareStackTrace;
    if (process.env.npm_execpath.includes('yarn')) {
        Error.prepareStackTrace = function capture(...args) {
            return original.apply(this, args).split('\n').filter((i) => !i.includes('.pnp')).join('\n');
        };
    }
    if (process.env.npm_execpath.includes('pnpm')) {
        Error.prepareStackTrace = function capture(...args) {
            const res = original.apply(this, args);
            if (!res.includes('.pnpm')) return res;
            return res.replace(
                /([( ])([^( ]+\/\.pnpm\/.+?\/node_modules\/)(.+)(:\d+:[^)\n]+)/g,
                '$1\u001B]8;;$2$3$4\u0007pnpm:$3$4\u001B]8;;\u0007',
            );
        };
    }
}

require('./commands');
