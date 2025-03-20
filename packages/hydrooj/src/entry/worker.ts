/* eslint-disable import/no-dynamic-require */
/* eslint-disable no-await-in-loop */
import os from 'os';
import path from 'path';
import cac from 'cac';
import fs from 'fs-extra';
import { Context } from '../context';
import { Logger } from '../logger';
import { load } from '../options';
import { MongoService } from '../service/db';
import { ConfigService } from '../settings';
import {
    addon, builtinModel, locale, model, service, setting,
} from './common';

const argv = cac().parse();
const logger = new Logger('worker');
const tmpdir = path.resolve(os.tmpdir(), 'hydro');

export async function apply(ctx: Context) {
    fs.ensureDirSync(tmpdir);
    require('../utils');
    require('../error');
    require('../service/bus').apply(ctx);
    const url = await MongoService.getUrl();
    if (!url) {
        logger.info('Starting setup');
        await require('./setup').load(ctx);
    }
    const pending = global.addons;
    const fail = [];
    await locale(pending, fail);
    await ctx.plugin(MongoService, load() || {});
    await ctx.plugin(ConfigService);
    const modelSystem = require('../model/system');
    await modelSystem.runConfig();
    ctx = await new Promise((resolve) => {
        ctx.inject(['loader', 'config'], (c) => {
            resolve(c);
        });
    });
    await ctx.plugin(require('../service/hmr').default, { watch: argv.options.watch });
    await Promise.all([
        ctx.loader.reloadPlugin(require.resolve('../service/storage'), 'file'),
        ctx.loader.reloadPlugin(require.resolve('../service/worker'), 'worker'),
        ctx.loader.reloadPlugin(require.resolve('../service/server'), 'server'),
    ]);
    ctx = await new Promise((resolve) => {
        ctx.inject(['server'], (c) => {
            resolve(c);
        });
    });
    await require('../service/api').apply(ctx);
    require('../lib/index');

    ctx.plugin(require('../service/monitor'));
    ctx.plugin(require('../service/check'));
    await service(pending, fail, ctx);
    await builtinModel(ctx);
    await model(pending, fail, ctx);
    await setting(pending, fail, require('../model/setting'));
    ctx = await new Promise((resolve) => {
        ctx.inject(['worker', 'setting'], (c) => {
            resolve(c);
        });
    });
    const handlerDir = path.resolve(__dirname, '..', 'handler');
    const handlers = await fs.readdir(handlerDir);
    for (const h of handlers.filter((i) => i.endsWith('.ts'))) {
        ctx.loader.reloadPlugin(path.resolve(handlerDir, h), '');
    }
    ctx.plugin(require('../service/migration').default);
    await addon(pending, fail, ctx);
    const scriptDir = path.resolve(__dirname, '..', 'script');
    for (const h of await fs.readdir(scriptDir)) {
        ctx.loader.reloadPlugin(path.resolve(scriptDir, h), '');
    }
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
    for (const f of Object.values(global.addons)) {
        const dir = path.join(f, 'public');
        // eslint-disable-next-line no-await-in-loop
        if (await fs.pathExists(dir)) await fs.copy(dir, path.join(os.homedir(), '.hydro/static'));
    }
    ctx.inject(['server'], async ({ server }) => {
        await server.listen();
        await ctx.parallel('app/listen');
        logger.success('Server started');
        process.send?.('ready');
        await ctx.parallel('app/ready');
    });
    return { fail };
}
