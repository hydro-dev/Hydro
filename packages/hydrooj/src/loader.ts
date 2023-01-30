/* eslint-disable import/no-dynamic-require */
/* eslint-disable consistent-return */
/* eslint-disable simple-import-sort/imports */
/* eslint-disable no-await-in-loop */
/* eslint-disable no-eval */
import './init';
import './interface';
import Schema from 'schemastery';
import path from 'path';
// eslint-disable-next-line import/no-duplicates
import './utils';
import cac from 'cac';
import './ui';
import './lib/i18n';

import { Logger } from './logger';
import { Context } from './context';
// eslint-disable-next-line import/no-duplicates
import { unwrapExports } from './utils';
import { PRIV } from './model/builtin';
import { inject } from './lib/ui';

const argv = cac().parse();
const logger = new Logger('loader');
logger.debug('%o', argv);

process.on('unhandledRejection', logger.error);
process.on('uncaughtException', logger.error);

export function resolveConfig(plugin: any, config: any) {
    if (config === false) return;
    if (config === true) config = undefined;
    config ??= {};
    const schema = plugin['Config'] || plugin['schema'];
    if (schema && plugin['schema'] !== false) config = schema(config);
    return config;
}
Context.service('loader');

const timeout = Symbol.for('loader.timeout');
const showLoadTime = argv.options.showLoadTime;

export class Loader {
    static readonly Record = Symbol.for('loader.record');

    public app: Context;
    public config: Context.Config;
    public suspend = false;
    public cache: Record<string, string> = Object.create(null);

    unloadPlugin(ctx: Context, key: string) {
        const fork = ctx.state[Loader.Record][key];
        if (fork) {
            fork.dispose();
            delete ctx.state[Loader.Record][key];
            logger.info('unload plugin %c', key);
        }
    }

    async reloadPlugin(parent: Context, key: string, config: any, asName = '') {
        let fork = parent.state[Loader.Record]?.[key];
        if (fork) {
            logger.info('reload plugin %c', key.split('node_modules').pop());
            fork.update(config);
        } else {
            logger.info('apply plugin %c', key.split('node_modules').pop());
            let plugin = await this.resolvePlugin(key);
            if (!plugin) return;
            resolveConfig(plugin, config);
            if (asName) plugin.name = asName;
            // fork = parent.plugin(plugin, this.interpolate(config));
            if (plugin.apply) {
                const original = plugin.apply;
                const apply = (...args) => {
                    const start = Date.now();
                    const result = Promise.resolve()
                        .then(() => original(...args))
                        .catch((e) => logger.error(e));
                    Promise.race([
                        result,
                        new Promise((resolve) => {
                            setTimeout(() => resolve(timeout), 10000);
                        }),
                    ]).then((t) => {
                        if (t === timeout) {
                            logger.warn('Plugin %s took too long to load', key);
                        }
                    });
                    if (showLoadTime && (typeof showLoadTime !== 'number' || Date.now() - start > showLoadTime)) {
                        logger.info('Plugin %s loaded in %dms', key, Date.now() - start);
                    }
                    return result;
                };
                plugin = Object.create(plugin);
                Object.defineProperty(plugin, 'apply', {
                    writable: true,
                    value: apply,
                    enumerable: true,
                });
            }
            fork = parent.plugin(plugin, config);
            if (!fork) return;
            parent.state[Loader.Record] ||= Object.create(null);
            parent.state[Loader.Record][key] = fork;
        }
        return fork;
    }

    async resolvePlugin(name: string) {
        try {
            this.cache[name] ||= require.resolve(name);
        } catch (err) {
            logger.error(err.message);
            return;
        }
        return unwrapExports(require(this.cache[name]));
    }
}

export function addon(addonPath: string, prepend = false) {
    try {
        // Is a npm package
        const packagejson = require.resolve(`${addonPath}/package.json`);
        // eslint-disable-next-line import/no-dynamic-require
        const payload = require(packagejson);
        const name = payload.name.startsWith('@hydrooj/') ? payload.name.split('@hydrooj/')[1] : payload.name;
        global.Hydro.version[name] = payload.version;
        const modulePath = path.dirname(packagejson);
        global.addons[prepend ? 'unshift' : 'push'](modulePath);
    } catch (e) {
        logger.error(`Addon not found: ${addonPath}`);
        logger.error(e);
        inject('Notification', 'Addon not found: {0}', { args: [addonPath], type: 'warn' }, PRIV.PRIV_VIEW_SYSTEM_NOTIFICATION);
    }
}

/** @deprecated */
export function addScript(name: string, description: string) {
    if (global.Hydro.script[name]) throw new Error(`duplicate script ${name} registered.`);
    return {
        args: <K extends Schema>(validate: K) => ({
            action: (run: (args: ReturnType<K>, report: any) => boolean | Promise<boolean>) => {
                global.Hydro.script[name] = {
                    description, validate, run,
                };
            },
        }),
    };
}

Context.service('loader');
const loader = new Loader();
app.loader = loader;
loader.app = app;
app.state[Loader.Record] = Object.create(null);

export async function load() {
    addon(path.resolve(__dirname, '..'), true);
    Error.stackTraceLimit = 50;
    await require('./entry/worker').apply(app);
    global.gc?.();
}

export async function loadCli() {
    process.env.HYDRO_CLI = 'true';
    await require('./entry/cli').load(app);
    setTimeout(() => process.exit(0), 300);
}
