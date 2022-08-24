/* eslint-disable simple-import-sort/imports */
/* eslint-disable no-await-in-loop */
/* eslint-disable no-eval */
import './init';
import './interface';
import Schema from 'schemastery';
import path from 'path';
import fs from 'fs-extra';
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
    if (!(fs.existsSync(addonPath) && fs.statSync(addonPath).isFile())) {
        try {
            // Is a npm package
            const packagejson = require.resolve(`${addonPath}/package.json`);
            // eslint-disable-next-line import/no-dynamic-require
            const payload = require(packagejson);
            const name = payload.name.startsWith('@hydrooj/') ? payload.name.split('@hydrooj/')[1] : payload.name;
            global.Hydro.version[name] = payload.version;
            const modulePath = path.dirname(packagejson);
            const publicPath = path.resolve(modulePath, 'public');
            if (fs.existsSync(publicPath)) {
                global.publicDirs[prepend ? 'push' : 'unshift'](publicPath);
                const targets = fs.readdirSync(publicPath);
                for (const target of targets) {
                    if (global.Hydro.ui.manifest[target] && !prepend) {
                        global.Hydro.ui.manifest[target] = publicPath;
                    } else if (!global.Hydro.ui.manifest[target]) {
                        global.Hydro.ui.manifest[target] = publicPath;
                    }
                }
            }
            global.addons[prepend ? 'unshift' : 'push'](modulePath);
        } catch (e) {
            logger.error(`Addon not found: ${addonPath}`);
            logger.error(e);
        }
    } else logger.error(`Addon not found: ${addonPath}`);
}

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
    if (global.gc) global.gc();
}

export async function loadCli() {
    await require('./entry/cli').load();
    setTimeout(() => process.exit(0), 300);
}
