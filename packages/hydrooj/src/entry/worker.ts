import os from 'os';
import path from 'path';
import cac from 'cac';
import fs from 'fs-extra';
import { Context } from '../context';
import { Logger } from '../logger';
import SystemModel from '../model/system';
import { load } from '../options';
import { MongoService } from '../service/db';
import { SettingService } from '../settings';
import {
    addon, builtinModel, locale, model, service,
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
    await ctx.plugin(SettingService);
    await ctx.plugin(SystemModel.Service);
    ctx = await new Promise((resolve) => {
        ctx.inject(['loader', 'setting', 'db', 'model:system'], (c) => {
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
    require('../lib/index');

    ctx.plugin(require('../service/monitor'));
    ctx.plugin(require('../service/check').default);
    await service(pending, fail, ctx);
    await builtinModel(ctx);
    await model(pending, fail, ctx);
    ctx = await new Promise((resolve) => {
        ctx.inject(['worker', 'setting'], (c) => {
            resolve(c);
        });
    });
    const loadDir = async (dir: string) => Promise.all((await fs.readdir(dir)).filter((i) => i.endsWith('.ts'))
        .map((h) => ctx.loader.reloadPlugin(path.resolve(dir, h), '')));
    await loadDir(path.resolve(__dirname, '..', 'handler'));
    await ctx.plugin(require('../service/migration').default);
    await addon(pending, fail, ctx);
    await loadDir(path.resolve(__dirname, '..', 'script'));
    await ctx.parallel('app/started');
    if (process.env.NODE_APP_INSTANCE === '0') {
        const staticDir = path.join(os.homedir(), '.hydro/static');
        await fs.emptyDir(staticDir);
        // Use ordered copy to allow resource override
        for (const f of Object.values(global.addons)) {
            const dir = path.join(f, 'public');
            // eslint-disable-next-line no-await-in-loop
            if (await fs.pathExists(dir)) await fs.copy(dir, staticDir);
        }
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
    ctx.inject(['server'], async ({ server }) => {
        await server.listen();
        await ctx.parallel('app/listen');
        logger.success('Server started');
        process.send?.('ready');
        await ctx.parallel('app/ready');
    });
    return { fail };
}
