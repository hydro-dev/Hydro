/* eslint-disable import/no-dynamic-require */
/* eslint-disable no-await-in-loop */
import os from 'os';
import path from 'path';
import cac from 'cac';
import fs from 'fs-extra';
import { Context } from '../context';
import { Logger } from '../logger';
import { load } from '../options';
import db from '../service/db';
import {
    addon, builtinModel, handler, lib, locale, model,
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
    require('../service/bus').apply(ctx);
    const config = load();
    if (!process.env.CI && !config) {
        logger.info('Starting setup');
        await require('./setup').load(ctx);
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
    // Make sure everything is ready and then start main entry
    if (argv.options.watch) ctx.plugin(require('../service/watcher').default, {});
    await ctx.root.start();
    await ctx.lifecycle.flush();
    await require('../service/worker').apply(ctx);
    await require('../service/server').apply(ctx);
    await require('../service/api').apply(ctx);
    await ctx.lifecycle.flush();
    require('../lib/index');
    await lib(pending, fail, ctx);
    await ctx.lifecycle.flush();

    await setting(pending, fail, require('../model/setting'));
    ctx.plugin(require('../service/monitor'));
    ctx.plugin(require('../service/check'));
    await service(pending, fail, ctx);
    await builtinModel(ctx);
    await model(pending, fail, ctx);
    await ctx.lifecycle.flush();

    const handlerDir = path.resolve(__dirname, '..', 'handler');
    const handlers = await fs.readdir(handlerDir);
    for (const h of handlers.filter((i) => i.endsWith('.ts'))) {
        ctx.loader.reloadPlugin(ctx, path.resolve(handlerDir, h), {}, `hydrooj/handler/${h.split('.')[0]}`);
    }
    ctx.plugin(require('../service/migration').default);
    await handler(pending, fail, ctx);
    await addon(pending, fail, ctx);
    await ctx.lifecycle.flush();
    const scriptDir = path.resolve(__dirname, '..', 'script');
    for (const h of await fs.readdir(scriptDir)) {
        ctx.loader.reloadPlugin(ctx, path.resolve(scriptDir, h), {}, `hydrooj/script/${h.split('.')[0]}`);
    }
    await ctx.lifecycle.flush();
    await script(pending, fail, ctx);
    await ctx.lifecycle.flush();
    await ctx.parallel('app/started');
    if (process.env.NODE_APP_INSTANCE === '0') {
        await new Promise((resolve, reject) => {
            ctx.inject(['migration'], async (c) => {
                c.migration.registerChannel('hydrooj', require('../upgrade').coreScripts);
                try {
                    await c.migration.doUpgrade();
                    resolve(null);
                } catch (e) {
                    logger.error('Upgrade failed: %O', e);
                    reject(e);
                }
            });
        });
    }
    for (const f of global.addons) {
        const dir = path.join(f, 'public');
        // eslint-disable-next-line no-await-in-loop
        if (await fs.pathExists(dir)) await fs.copy(dir, path.join(os.homedir(), '.hydro/static'));
    }
    await ctx.parallel('app/listen');
    logger.success('Server started');
    process.send?.('ready');
    await ctx.parallel('app/ready');
    return { fail };
}
