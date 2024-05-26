import fs from 'fs';
import { resolve } from 'path';
import cac from 'cac';
import proxy from 'koa-proxies';
import cache from 'koa-static-cache';
import type { FindCursor } from 'mongodb';
import { Context } from '../context';
import { PermissionError, PrivilegeError } from '../error';
import paginate from '../lib/paginate';
import { Logger } from '../logger';
import { PERM, PRIV } from '../model/builtin';
import * as opcount from '../model/opcount';
import * as OplogModel from '../model/oplog';
import * as system from '../model/system';
import { builtinConfig } from '../settings';
import baseLayer from './layers/base';
import domainLayer from './layers/domain';
import rendererLayer from './layers/renderer';
import responseLayer from './layers/response';
import userLayer from './layers/user';
import type { HandlerCommon } from './server';

const argv = cac().parse();
const ignoredLimit = `,${argv.options.ignoredLimit},`;

const logger = new Logger('server');

declare module './server' {
    export interface HandlerCommon {
        paginate: <T>(cursor: FindCursor<T>, page: number, key: string) => Promise<[docs: T[], numPages: number, count: number]>;
        progress: (message: string, params: any[]) => void;
        limitRate: (op: string, periodSecs: number, maxOperations: number, withUserId?: boolean) => Promise<void>;
    }
}

export async function apply(ctx: Context) {
    if (process.env.HYDRO_CLI) return;
    ctx.plugin(require('./server'), {
        keys: system.get('session.keys'),
        proxy: !!system.get('server.xproxy') || !!system.get('server.xff'),
        cors: system.get('server.cors') || '',
        upload: system.get('server.upload') || '256m',
        port: argv.options.port || system.get('server.port'),
    });
    ctx.inject(['server'], ({ server, on }) => {
        const proxyMiddleware = proxy('/fs', {
            target: builtinConfig.file.endPoint,
            changeOrigin: true,
            rewrite: (p) => p.replace('/fs', ''),
        });
        server.addCaptureRoute('/fs/', async (c, next) => {
            if (c.request.search.toLowerCase().includes('x-amz-credential')) return await proxyMiddleware(c, next);
            c.request.path = c.path = c.path.split('/fs')[1];
            return await next();
        });
        server.addHttpLayer('init', async (c, next) => {
            const init = Date.now();
            try {
                await next();
            } finally {
                const finish = Date.now();
                if (finish - init > 5000) {
                    const method = c.request.method;
                    const id = await OplogModel.log(c.handler, 'slow_request', { method, processtime: finish - init });
                    logger.warn(`Slow handler: ID=${id}, `, method, c.path, `${finish - init}ms`);
                }
                // TODO metrics: calc avg response time
            }
        });

        server.addLayer('domain', domainLayer);
        server.addLayer('base', baseLayer);
        server.addLayer('renderer', rendererLayer(server.router, logger));
        server.addHttpLayer('response', responseLayer(logger));
        server.addLayer('user', userLayer);

        for (const addon of [...global.addons].reverse()) {
            const dir = resolve(addon, 'public');
            if (!fs.existsSync(dir)) continue;
            server.addLayer(`${addon}_public`, cache(dir, {
                maxAge: argv.options.public ? 0 : 24 * 3600 * 1000,
            }));
        }
        server.HandlerCommon.prototype.paginate = function <T>(this: HandlerCommon, cursor: FindCursor<T>, page: number, key: string) {
            return paginate(cursor, page, this.ctx.setting.get(`pagination.${key}`));
        };
        server.HandlerCommon.prototype.checkPerm = function (this: HandlerCommon, ...args: bigint[]) {
            if (!this.user.hasPerm(...args)) {
                if (this.user.hasPriv(PRIV.PRIV_USER_PROFILE)) throw new PermissionError(...args);
                throw new PrivilegeError(PRIV.PRIV_USER_PROFILE);
            }
        };
        server.HandlerCommon.prototype.checkPriv = function (this: HandlerCommon, ...args: number[]) {
            if (!this.user.hasPriv(...args)) throw new PrivilegeError(...args);
        };
        server.HandlerCommon.prototype.progress = function (this: HandlerCommon, message: string, params: any[]) {
            Hydro.model.message.sendInfo(this.user._id, JSON.stringify({ message, params }));
        };
        server.HandlerCommon.prototype.limitRate = async function limitRate(
            op: string, periodSecs: number, maxOperations: number, withUserId = system.get('limit.by_user'),
        ) {
            if (ignoredLimit.includes(op)) return;
            if (this.user && this.user.hasPriv(PRIV.PRIV_UNLIMITED_ACCESS)) return;
            const overrideLimit = system.get(`limit.${op}`);
            if (overrideLimit) maxOperations = overrideLimit;
            let id = this.request.ip;
            if (withUserId) id += `@${this.user._id}`;
            await opcount.inc(op, id, periodSecs, maxOperations);
        };
        on('handler/create', async (h) => {
            if (!argv.options.benchmark && !h.notUsage) await h.limitRate('global', 5, 100);
            h.loginMethods = Object.keys(global.Hydro.module.oauth)
                .map((key) => ({
                    id: key,
                    icon: global.Hydro.module.oauth[key].icon,
                    text: global.Hydro.module.oauth[key].text,
                }));
            if (!h.noCheckPermView && !h.user.hasPriv(PRIV.PRIV_VIEW_ALL_DOMAIN)) h.checkPerm(PERM.PERM_VIEW);
        });
    });
}
