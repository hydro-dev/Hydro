/* eslint-disable consistent-return */
/* eslint-disable simple-import-sort/imports */
import './init';
import './interface';
import path from 'path';
import child from 'child_process';
// eslint-disable-next-line import/no-duplicates
import './utils';
import cac from 'cac';
import './ui';
import { I18nService } from './lib/i18n';

import { Logger } from './logger';
import {
    Context, Service, FiberState, Fiber,
} from './context';
// eslint-disable-next-line import/no-duplicates
import { sleep, unwrapExports } from './utils';
import { PRIV } from './model/builtin';
import { getAddons } from './options';
import Schema from 'schemastery';

const argv = cac().parse();
const logger = new Logger('loader');
logger.debug('%o', argv);

process.on('unhandledRejection', logger.error);
process.on('uncaughtException', logger.error);

const HYDROPATH = [];

if (process.env.NIX_PROFILES) {
    try {
        const result = JSON.parse(child.execSync('nix profile list --json').toString()) as any;
        for (const [name, derivation] of Object.entries(result.elements) as any) {
            if (!derivation.active) continue;
            if (name.startsWith('hydro-plugin-') && derivation.storePaths) {
                HYDROPATH.push(...derivation.storePaths);
            }
        }
    } catch (e) {
        logger.error('Nix detected, but failed to list installed derivations.');
    }
}

export class Loader extends Service {
    public state: Record<string, Fiber> = Object.create(null);
    public suspend = false;
    public cache: Record<string, string> = Object.create(null);
    // public warnings: Record<string, string> = Object.create(null);

    static inject = ['setting', 'timer', 'i18n', 'logger'];

    constructor(ctx: Context) {
        super(ctx, 'loader');

        ctx.on('app/started', () => {
            ctx.interval(async () => {
                const pending = Object.entries(this.state).filter((v) => v[1].state === FiberState.PENDING);
                if (pending.length) {
                    logger.warn('Plugins are still pending: %s', pending.map((v) => v[0]).join(', '));
                    for (const [key, value] of pending) {
                        logger.warn('Plugin %s is still pending', key);
                        console.log(value);
                    }
                }
                const loading = Object.entries(this.state).filter((v) => v[1].state === FiberState.LOADING);
                if (loading.length) {
                    logger.warn('Plugins are still loading: %s', loading.map((v) => v[0]).join(', '));
                    for (const [key, value] of loading) {
                        logger.warn('Plugin %s is still loading', key);
                        console.log(value);
                    }
                }
                const failed = Object.entries(this.state).filter((v) => v[1].state === FiberState.FAILED);
                if (failed.length) {
                    logger.warn('Plugins failed to load: %s', failed.map((v) => v[0]).join(', '));
                    for (const [key, value] of failed) {
                        logger.warn('Plugin %s failed to load', key);
                        console.log(value);
                    }
                }
            }, 10000);
        });
    }

    unloadPlugin(key: string) {
        const fork = this.state[key];
        if (fork) {
            fork.dispose();
            delete this.state[key];
            logger.info('unload plugin %c', key);
        }
    }

    async resolveConfig(plugin: any, configScope: string) {
        const schema = plugin['Config'] || plugin['schema'];
        if (!schema) return {};
        const schemaRequest = configScope ? Schema.object({
            [configScope]: schema,
        }) : schema;
        await this.ctx.setting._tryMigrateConfig(schemaRequest);
        const res = this.ctx.setting.requestConfig(schemaRequest);
        return configScope ? res[configScope] : res;
    }

    async reloadPlugin(key: string, configScope: string) {
        const plugin = this.resolvePlugin(key);
        if (!plugin) return;
        const config = await this.resolveConfig(plugin, configScope);
        let fork = this.state[key];
        const displayPath = key.includes('node_modules')
            ? key.split('node_modules').pop()
            : path.relative(process.cwd(), key);
        logger.info(
            `%s plugin %c${configScope ? ' with scope %c' : ''}`,
            fork ? 'reload' : 'apply', displayPath, configScope,
        );
        if (fork) {
            fork.update(config);
        } else {
            fork = this.ctx.plugin(plugin, config);
            if (!fork) return;
            this.state[key] = fork;
        }
        return fork;
    }

    resolvePlugin(name: string) {
        try {
            this.cache[name] ||= require.resolve(name);
        } catch (err) {
            try {
                this.cache[name] ||= require.resolve(name, { paths: HYDROPATH });
            } catch (e) {
                logger.error('Failed to resolve plugin %s', name);
                logger.error(err);
                return;
            }
        }
        return unwrapExports(require(this.cache[name]));
    }
}

app.plugin(I18nService);
app.plugin(Loader);

async function preload() {
    global.app = await new Promise((resolve) => {
        app.inject(['timer', 'i18n', 'logger', '$api'], (c) => {
            resolve(c);
        });
    });
    for (const a of [path.resolve(__dirname, '..'), ...getAddons()]) {
        try {
            // Is a npm package
            const packagejson = require.resolve(`${a}/package.json`);
            const payload = require(packagejson);
            const name = payload.name.startsWith('@hydrooj/') ? payload.name.split('@hydrooj/')[1] : payload.name;
            global.Hydro.version[name] = payload.version;
            const modulePath = path.dirname(packagejson);
            global.addons[name] = modulePath;
        } catch (e) {
            logger.error(`Addon not found: ${a}`);
            logger.error(e);
            app.injectUI('Notification', 'Addon not found: {0}', { args: [a], type: 'warn' }, PRIV.PRIV_VIEW_SYSTEM_NOTIFICATION);
        }
    }
}

export async function load() {
    await preload();
    Error.stackTraceLimit = 50;
    try {
        const { simpleGit } = require('simple-git') as typeof import('simple-git');
        const { all } = await simpleGit().log();
        if (all.length > 0) Hydro.version.hydrooj += `-${all[0].hash.substring(0, 7)}`;
        const { isClean } = await simpleGit().status();
        if (!isClean()) Hydro.version.hydrooj += '-dirty';
        if (process.env.DEV) {
            const q = await simpleGit().listRemote(['--get-url']);
            if (!q.includes('hydro-dev/Hydro')) {
                console.warn('\x1B[93m');
                console.warn('DISCLAIMER:');
                console.warn(' You are under development mode.');
                console.warn(' The Hydro project is licensed under AGPL3,');
                console.warn(' which means you have to open source all your modifications');
                console.warn(' and keep all copyright notice');
                console.warn(' unless you have got another license from the original author.');
                console.warn('');
                console.warn('声明：');
                console.warn(' 你正在运行开发者模式。');
                console.warn(' Hydro 项目基于 AGPL3 协议开源，');
                console.warn(' 这意味着除非你获得了原作者的其他授权，');
                console.warn(' 你需要同样以 AGPL3 协议开源所有的修改，');
                console.warn(' 并保留所有的版权声明。');
                console.warn('\x1B[39m');
                console.log('');
                console.log('Hydro will start in 5s.');
                console.log('Hydro 将在五秒后继续启动。');
                await sleep(5000);
            }
        }
    } catch (e) { }
    await require('./entry/worker').apply(app);
    global.gc?.();
}

export async function loadCli() {
    process.env.HYDRO_CLI = 'true';
    await preload();
    await require('./entry/cli').load(app);
    setTimeout(() => process.exit(0), 300);
}
