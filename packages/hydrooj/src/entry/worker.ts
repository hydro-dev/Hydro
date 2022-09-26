/* eslint-disable import/no-dynamic-require */
/* eslint-disable no-await-in-loop */
import os from 'os';
import path from 'path';
import cac from 'cac';
import fs from 'fs-extra';
import { Context } from '../context';
import { Logger } from '../logger';
import db from '../service/db';
import {
    addon, handler, lib, locale, model,
    script, service, setting, template,
} from './common';

const argv = cac().parse();
const logger = new Logger('worker');
const tmpdir = path.resolve(os.tmpdir(), 'hydro');

export async function apply(ctx: Context) {
    fs.ensureDirSync(tmpdir);
    require('../lib/i18n');
    require('../utils');
    require('../error');
    const config = require('../options')();
    if (!process.env.CI && !config) {
        logger.info('Starting setup');
        await require('./setup').load();
    }
    const pending = global.addons;
    const fail = [];
    await Promise.all([
        locale(pending, fail),
        template(pending, fail),
    ]);
    await db.start();
    await require('../settings').loadConfig();
    const modelSystem = require('../model/system');
    await modelSystem.runConfig();
    const storage = require('../service/storage');
    await storage.loadStorageService();
    await require('hydrooj/src/service/server').apply(ctx);
    // Make sure everything is ready and then start main entry
    if (argv.options.watch) await ctx.loader.reloadPlugin(ctx, 'hydrooj/src/service/watcher', {});
    await ctx.root.start();
    require('../lib/index');
    await lib(pending, fail, ctx);
    require('../service/monitor');
    await service(pending, fail, ctx);
    require('../model/index');
    const handlerDir = path.resolve(__dirname, '..', 'handler');
    const handlers = await fs.readdir(handlerDir);
    for (const h of handlers) {
        ctx.loader.reloadPlugin(ctx, path.resolve(handlerDir, h), {}, `hydrooj/handler/${h.split('.')[0]}`);
    }
    await model(pending, fail, ctx);
    const modelSetting = require('../model/setting');
    await setting(pending, fail, modelSetting);
    await handler(pending, fail, ctx);
    await addon(pending, fail, ctx);
    for (const i in global.Hydro.handler) await global.Hydro.handler[i]();
    const scriptDir = path.resolve(__dirname, '..', 'script');
    for (const h of await fs.readdir(scriptDir)) {
        ctx.loader.reloadPlugin(ctx, path.resolve(scriptDir, h), {}, `hydrooj/script/${h.split('.')[0]}`);
    }
    await script(pending, fail, ctx);
    await ctx.parallel('app/started');
    if (process.env.NODE_APP_INSTANCE === '0') {
        const scripts = require('../upgrade').default;
        let dbVer = (await modelSystem.get('db.ver')) ?? 0;
        const isFresh = !dbVer;
        const expected = scripts.length;
        while (dbVer < expected) {
            const func = scripts[dbVer];
            if (typeof func !== 'function' || (isFresh && func.toString().includes('_FRESH_INSTALL_IGNORE'))) {
                dbVer++;
                continue;
            }
            logger.info('Upgrading database: from %d to %d', dbVer, expected);
            const result = await func();
            if (!result) break;
            dbVer++;
            await modelSystem.set('db.ver', dbVer);
        }
    }
    logger.success('Server started');
    process.send?.('ready');
    await ctx.parallel('app/ready');
    return { fail };
}
