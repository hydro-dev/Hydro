/* eslint-disable simple-import-sort/imports */
/* eslint-disable no-await-in-loop */
/* eslint-disable no-eval */
import 'reflect-metadata';
import './init';
import './interface';
import path from 'path';
import fs from 'fs-extra';
import './utils';
import cac from 'cac';
import { Logger } from './logger';
import './ui';

export * from './interface';
const argv = cac().parse();
if (argv.options.debug) {
    process.env.NODE_ENV = 'development';
    process.env.DEV = 'on';
} else process.env.NODE_ENV = process.env.NODE_ENV || 'production';
const logger = new Logger('loader');
logger.debug('%o', argv);

process.on('unhandledRejection', logger.error);
process.on('uncaughtException', logger.error);

export function addon(addonPath: string, prepend = false) {
    if (!(fs.existsSync(addonPath) && fs.statSync(addonPath).isFile())) {
        try {
            // Is a npm package
            const packagejson = require.resolve(`${addonPath}/package.json`);
            const modulePath = path.dirname(packagejson);
            const publicPath = path.resolve(modulePath, 'public');
            if (fs.existsSync(publicPath)) global.publicDirs[prepend ? 'push' : 'unshift'](publicPath);
            global.addons[prepend ? 'unshift' : 'push'](modulePath);
        } catch (e) {
            logger.error(`Addon not found: ${addonPath}`);
        }
    } else logger.error(`Addon not found: ${addonPath}`);
}

export async function load() {
    addon(path.resolve(__dirname, '..'), true);
    Error.stackTraceLimit = 50;
    require('./entry/worker').load();
    if (global.gc) global.gc();
}

export async function loadCli() {
    await require('./entry/cli').load();
    process.kill(process.pid, 'SIGINT');
}
