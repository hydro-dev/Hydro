import fs from 'fs';
import { resolve } from 'path';
import cac from 'cac';
import proxy from 'koa-proxies';
import cache from 'koa-static-cache';
import { type FindCursor, ObjectId } from 'mongodb';
import {
    ConnectionHandler as ConnectionHandlerOriginal, Handler as HandlerOriginal, HydroError, NotFoundError, UserFacingError,
} from '@hydrooj/framework';
import { errorMessage, Time } from '@hydrooj/utils';
import { Context } from '../context';
import { PermissionError, PrivilegeError } from '../error';
import type { DomainDoc } from '../interface';
import { Logger } from '../logger';
import { PERM, PRIV } from '../model/builtin';
import * as opcount from '../model/opcount';
import * as OplogModel from '../model/oplog';
import * as system from '../model/system';
import { builtinConfig } from '../settings';
import db from './db';
import baseLayer from './layers/base';
import domainLayer from './layers/domain';
import userLayer from './layers/user';

const argv = cac().parse();
const ignoredLimit = `,${argv.options.ignoredLimit},`;

const logger = new Logger('server');

declare module '@hydrooj/framework' {
    export interface HandlerCommon {
        domain: DomainDoc;

        paginate<T>(cursor: FindCursor<T>, page: number, key: string): Promise<[docs: T[], numPages: number, count: number]>;
        paginate<T>(cursor: FindCursor<T>, page: number, limit: number): Promise<[docs: T[], numPages: number, count: number]>;
        progress(message: string, params: any[]): void;
        limitRate(op: string, periodSecs: number, maxOperations: number, defaultKey?: string): Promise<void>;
        renderTitle(str: string): string;
    }
}

export * from '@hydrooj/framework/decorators';
export * from '@hydrooj/framework/validator';

/*
 * For security concern, some API requires sudo privilege to access.
 * And for some superadmin operations,
 * we do not allow them using a password to perform the sudo operation,
 * as most user choose to use "remember password" option.
 * When teachers are using a superuser account, accessing from classrooms,
 * it may lead to serious security issues.
 * !!! Please make sure that all superuser accounts have two factor authentication enabled. !!!
 */
export function requireSudo(target: any, funcName: string, obj: any) {
    const originalMethod = obj.value;
    obj.value = function sudo(this: Handler, ...args: any[]) {
        if (this.session.sudo && Date.now() - this.session.sudo < Time.hour) {
            if (this.session.sudoArgs?.referer) this.request.headers.referer = this.session.sudoArgs.referer;
            this.session.sudoArgs = null;
            return originalMethod.call(this, ...args);
        }
        this.session.sudoArgs = {
            method: this.request.method,
            referer: this.request.headers.referer,
            args: this.args,
            redirect: this.request.originalPath,
        };
        this.response.redirect = this.url('user_sudo');
        return 'cleanup';
    };
    return obj;
}

export interface Handler {
    domain: DomainDoc;
    ctx: Context;
}
export class Handler extends HandlerOriginal {
    constructor(_, ctx: Context) {
        super(_, ctx);
        this.ctx = ctx.extend({ domain: this.domain });
        this.renderHTML = ((orig) => function (name: string, args: Record<string, any>) {
            const s = name.split('.');
            let templateName = `${s[0]}.${args.domainId}.${s[1]}`;
            if (!global.Hydro.ui.template[templateName]) templateName = name;
            return orig(templateName, args);
        })(this.renderHTML).bind(this);
    }

    async onerror(error: HydroError) {
        error.msg ||= () => error.message;
        if (error instanceof UserFacingError && !process.env.DEV) error.stack = '';
        if (!(error instanceof NotFoundError) && !('nolog' in error)) {
            // eslint-disable-next-line max-len
            logger.error(`User: ${this.user._id}(${this.user.uname}) ${this.request.method}: /d/${this.domain._id}${this.request.path}`, error.msg(), error.params);
            if (error.stack) logger.error(error.stack);
        }
        if (this.user?._id === 0 && (error instanceof PermissionError || error instanceof PrivilegeError)) {
            this.response.redirect = this.url('user_login', {
                query: {
                    redirect: (this.context.originalPath || this.request.path) + this.context.search,
                },
            });
        } else {
            this.response.status = error instanceof UserFacingError ? error.code : 500;
            this.response.template = error instanceof UserFacingError ? 'error.html' : 'bsod.html';
            this.response.body = {
                UserFacingError,
                error: { message: error.msg(), params: error.params, stack: errorMessage(error.stack || '') },
            };
        }
    }
}

export interface ConnectionHandler {
    domain: DomainDoc;
    ctx: Context;
}
export class ConnectionHandler extends ConnectionHandlerOriginal {
    constructor(_, ctx: Context) {
        super(_, ctx);
        this.ctx = ctx.extend({ domain: this.domain });
    }

    onerror(err: HydroError) {
        if (!(err instanceof NotFoundError)
            && !((err instanceof PrivilegeError || err instanceof PermissionError) && this.user?._id === 0)) {
            logger.error(`Path:${this.request.path}, User:${this.user?._id}(${this.user?.uname})`);
            logger.error(err);
        }
        super.onerror(err);
    }
}

export async function apply(ctx: Context) {
    ctx.plugin(require('@hydrooj/framework'), {
        keys: system.get('session.keys'),
        proxy: !!system.get('server.xproxy') || !!system.get('server.xff'),
        cors: system.get('server.cors') || '',
        upload: system.get('server.upload') || '256m',
        port: argv.options.port || system.get('server.port'),
        host: argv.options.host || system.get('server.host'),
        xff: system.get('server.xff'),
        xhost: system.get('server.xhost'),
    });
    if (process.env.HYDRO_CLI) return;
    ctx.inject(['server'], ({ server, on }) => {
        let endpoint = builtinConfig.file.endPoint;
        if (builtinConfig.file.type === 's3' && !builtinConfig.file.pathStyle) {
            try {
                const parsed = new URL(builtinConfig.file.endPoint);
                parsed.hostname = `${builtinConfig.file.bucket}.${parsed.hostname}`;
                endpoint = parsed.toString();
            } catch (e) {
                logger.warn('Failed to parse file endpoint');
            }
        }
        const proxyMiddleware = proxy('/fs', {
            target: endpoint,
            changeOrigin: true,
            rewrite: (p) => p.replace('/fs', ''),
        });
        server.addCaptureRoute('/fs/', async (c, next) => {
            if (c.request.search.toLowerCase().includes('x-amz-credential')) return await proxyMiddleware(c, next);
            c.request.path = c.path = c.path.split('/fs')[1];
            return await next();
        });
        server.addHandlerLayer('init', async (c, next) => {
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

        for (const addon of [...global.addons].reverse()) {
            const dir = resolve(addon, 'public');
            if (!fs.existsSync(dir)) continue;
            server.addServerLayer(`${addon}_public`, cache(dir, {
                maxAge: argv.options.public ? 0 : 24 * 3600 * 1000,
            }));
        }

        server.addServerLayer('domain', domainLayer);
        server.addWSLayer('domain', domainLayer);
        server.addLayer('base', baseLayer);
        server.addLayer('user', userLayer);

        server.handlerMixin({
            url(name: string, ...kwargsList: Record<string, any>[]) {
                if (name === '#') return '#';
                let res = '#';
                const args: any = Object.create(null);
                const query: any = Object.create(null);
                for (const kwargs of kwargsList) {
                    for (const key in kwargs) {
                        if (kwargs[key] instanceof ObjectId) args[key] = kwargs[key].toHexString();
                        else args[key] = kwargs[key].toString().replace(/\//g, '%2F');
                    }
                    for (const key in kwargs.query || {}) {
                        if (query[key] instanceof ObjectId) query[key] = kwargs.query[key].toHexString();
                        else query[key] = kwargs.query[key].toString();
                    }
                }
                try {
                    const { anchor } = args;
                    let withDomainId = args.domainId || false;
                    const domainId = this.args.domainId;
                    const host = this.domain?.host;
                    if (domainId !== 'system' && (
                        !this.request.host
                        || (host instanceof Array
                            ? (!host.includes(this.request.host))
                            : this.request.host !== host)
                    )) withDomainId ||= domainId;
                    res = ctx.server.router.url.call(ctx.server.router, name, args, { query }).toString();
                    if (anchor) res = `${res}#${anchor}`;
                    if (withDomainId) res = `/d/${withDomainId}${res}`;
                } catch (e) {
                    logger.warn(e.message);
                    logger.info('%s %o', name, args);
                    if (!e.message.includes('Expected') || !e.message.includes('to match')) logger.info('%s', e.stack);
                }
                return res;
            },
            translate(str: string) {
                if (!str) return '';
                const lang = this.user?.viewLang || this.session?.viewLang;
                const res = lang
                    ? str.toString().translate(lang, ...this.context.acceptsLanguages())
                    : str.toString().translate(...this.context.acceptsLanguages(), system.get('server.language'));
                return res;
            },
            paginate<T>(cursor: FindCursor<T>, page: number, key: string | number) {
                return db.paginate(cursor, page, typeof key === 'number' ? key : (this.ctx.setting.get(`pagination.${key}`) || 20));
            },
            checkPerm(...args: bigint[]) {
                if (!this.user.hasPerm(...args)) {
                    if (this.user.hasPriv(PRIV.PRIV_USER_PROFILE)) throw new PermissionError(...args);
                    throw new PrivilegeError(PRIV.PRIV_USER_PROFILE);
                }
            },
            checkPriv(...args: number[]) {
                if (!this.user.hasPriv(...args)) throw new PrivilegeError(...args);
            },
            progress(message: string, params: any[] = []) {
                Hydro.model.message.sendInfo(this.user._id, JSON.stringify({ message, params }));
            },
            async limitRate(
                op: string, periodSecs: number, maxOperations: number, defaultKey = system.get('limit.by_user') ? '{{ip}}@{{user}}' : '{{ip}}',
            ) {
                if (ignoredLimit.includes(op)) return;
                if (this.user && this.user.hasPriv(PRIV.PRIV_UNLIMITED_ACCESS)) return;
                const overrideLimit = system.get(`limit.${op}`);
                if (overrideLimit) maxOperations = overrideLimit;
                // deprecated: remove boolean support in future
                if (typeof defaultKey === 'boolean') defaultKey = defaultKey ? '{{user}}' : '{{ip}}';
                const id = defaultKey.replace('{{ip}}', this.request.ip).replace('{{user}}', this.user._id);
                await opcount.inc(op, id, periodSecs, maxOperations);
            },
            renderTitle(str: string) {
                const name = this.ctx.setting.get('server.name');
                if (this.UiContext.extraTitleContent) return `${this.UiContext.extraTitleContent} - ${this.translate(str)} - ${name}`;
                return `${this.translate(str)} - ${name}`;
            },
        });

        on('handler/create', async (h) => {
            h.user = h.context.HydroContext.user as any;
            h.domain = h.context.HydroContext.domain as any;
            h.translate = h.translate.bind(h);
            h.url = h.url.bind(h);
            h.ctx = h.ctx.extend({
                domain: h.domain,
            });
            if (!argv.options.benchmark && !h.notUsage) await h.limitRate('global', 5, 100);
            h.loginMethods = Object.keys(global.Hydro.module.oauth)
                .map((key) => ({
                    id: key,
                    icon: global.Hydro.module.oauth[key].icon,
                    text: global.Hydro.module.oauth[key].text,
                }));
            if (!h.noCheckPermView && !h.user.hasPriv(PRIV.PRIV_VIEW_ALL_DOMAIN)) h.checkPerm(PERM.PERM_VIEW);
            if (h.context.pendingError) throw h.context.pendingError;
        });

        on('app/listen', () => {
            server.listen();
        });
    });
}
