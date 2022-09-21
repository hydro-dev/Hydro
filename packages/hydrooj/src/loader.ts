/* eslint-disable simple-import-sort/imports */
/* eslint-disable no-await-in-loop */
/* eslint-disable no-eval */
import './init';
import './interface';
import Schema from 'schemastery';
import path from 'path';
import './utils';
import cac from 'cac';
import { Logger } from './logger';
import './ui';

// This is the main entry. So let's re-export some modules.
export * from './interface';
export { Schema, Logger };
export { requestConfig } from './settings';

const argv = cac().parse();
const logger = new Logger('loader');
logger.debug('%o', argv);

process.on('unhandledRejection', logger.error);
process.on('uncaughtException', logger.error);

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

export async function load() {
    addon(path.resolve(__dirname, '..'), true);
    Error.stackTraceLimit = 50;
    require('./entry/worker').load();
    global.gc?.();
}

export async function loadCli() {
    process.env.HYDRO_CLI = 'true';
    await require('./entry/cli').load();
    setTimeout(() => process.exit(0), 300);
}
