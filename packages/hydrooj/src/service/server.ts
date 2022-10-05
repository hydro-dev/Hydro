import http from 'http';
import { resolve } from 'path';
import cac from 'cac';
import fs from 'fs-extra';
import Koa from 'koa';
import Body from 'koa-body';
import Compress from 'koa-compress';
import proxy from 'koa-proxies';
import cache from 'koa-static-cache';
import WebSocket from 'ws';
import { parseMemoryMB } from '@hydrooj/utils/lib/utils';
import { Context, Service } from '../context';
import {
    HydroError, InvalidOperationError, MethodNotAllowedError,
    NotFoundError, PermissionError, PrivilegeError,
    UserFacingError,
} from '../error';
import { DomainDoc } from '../interface';
import { Logger } from '../logger';
import { PERM, PRIV } from '../model/builtin';
import * as opcount from '../model/opcount';
import * as system from '../model/system';
import { User } from '../model/user';
import { builtinConfig } from '../settings';
import { errorMessage } from '../utils';
import * as bus from './bus';
import * as decorators from './decorators';
import baseLayer from './layers/base';
import domainLayer from './layers/domain';
import rendererLayer from './layers/renderer';
import responseLayer from './layers/response';
import userLayer from './layers/user';
import { Router } from './router';
import { encodeRFC5987ValueChars } from './storage';

export * from './decorators';

export interface HydroRequest {
    method: string;
    host: string;
    hostname: string;
    ip: string;
    headers: Koa.Request['headers'];
    cookies: any;
    body: any;
    files: Record<string, import('formidable').File>;
    query: any;
    path: string;
    params: any;
    referer: string;
    json: boolean;
    websocket: boolean;
}
export interface HydroResponse {
    body: any,
    type: string,
    status: number,
    template?: string,
    redirect?: string,
    disposition?: string,
    etag?: string,
    attachment: (name: string, stream?: any) => void,
    addHeader: (name: string, value: string) => void,
}
interface HydroContext {
    request: HydroRequest;
    response: HydroResponse;
    user: User;
    domain?: DomainDoc;
    args: Record<string, any>;
    UiContext: Record<string, any>;
}
export interface KoaContext extends Koa.Context {
    HydroContext: HydroContext;
    handler: any;
    session: Record<string, any>;
    render: (name: string, args: any) => Promise<void>;
    renderHTML: (name: string, args: any) => Promise<string>;
    getUrl: (name: string, args: any) => string;
    translate: (key: string) => string;
}

const argv = cac().parse();
const logger = new Logger('server');
export const app = new Koa<Koa.DefaultState, KoaContext>({
    keys: system.get('server.keys'),
});
export const router = new Router();
export const httpServer = http.createServer(app.callback());
export const wsServer = new WebSocket.Server({ server: httpServer });
export const captureAllRoutes = {};
app.on('error', (error) => {
    if (error.code !== 'EPIPE' && error.code !== 'ECONNRESET' && !error.message.includes('Parse Error')) {
        logger.error('Koa app-level error', { error });
    }
});
wsServer.on('error', (error) => {
    console.log('Websocket server error:', error);
});

const ignoredLimit = `,${argv.options.ignoredLimit},`;
const serializer = (showDisplayName = false) => (k: string, v: any) => {
    if (k.startsWith('_') && k !== '_id') return undefined;
    if (typeof v === 'bigint') return `BigInt::${v.toString()}`;
    if (v instanceof User && !showDisplayName) delete v.displayName;
    return v;
};

export class HandlerCommon {
    render: (name: string, args?: any) => Promise<void>;
    renderHTML: (name: string, args?: any) => Promise<string>;
    url: (name: string, args?: any) => string;
    translate: (key: string) => string;
    session: Record<string, any>;
    /** @deprecated */
    domainId: string;

    constructor(
        public ctx: KoaContext, public args: Record<string, any>,
        public request: HydroRequest, public response: HydroResponse,
        public user: User, public domain: DomainDoc, public UiContext: Record<string, any>,
    ) {
        this.render = ctx.render.bind(ctx);
        this.renderHTML = ctx.renderHTML.bind(ctx);
        this.url = ctx.getUrl.bind(ctx);
        this.translate = ctx.translate.bind(ctx);
        this.session = ctx.session;
        this.domainId = args.domainId;
    }

    async limitRate(op: string, periodSecs: number, maxOperations: number, withUserId = false) {
        if (ignoredLimit.includes(op)) return;
        if (this.user && this.user.hasPriv(PRIV.PRIV_UNLIMITED_ACCESS)) return;
        const overrideLimit = system.get(`limit.${op}`);
        if (overrideLimit) maxOperations = overrideLimit;
        let id = this.request.ip;
        if (withUserId) id += `@${this.user._id}`;
        await opcount.inc(op, id, periodSecs, maxOperations);
    }

    renderTitle(str: string) {
        const name = this.domain?.ui?.name || system.get('server.name');
        if (this.UiContext.extraTitleContent) return `${this.ctx.translate(str)} - ${this.UiContext.extraTitleContent} - ${name}`;
        return `${this.ctx.translate(str)} - ${name}`;
    }

    checkPerm(...args: bigint[]) {
        if (!this.user.hasPerm(...args)) {
            if (this.user.hasPriv(PRIV.PRIV_USER_PROFILE)) throw new PermissionError(...args);
            throw new PrivilegeError(PRIV.PRIV_USER_PROFILE);
        }
    }

    checkPriv(...args: number[]) {
        if (!this.user.hasPriv(...args)) throw new PrivilegeError(...args);
    }
}

export class Handler extends HandlerCommon {
    loginMethods: any;
    noCheckPermView = false;
    __param: Record<string, decorators.ParamOption[]>;

    back(body?: any) {
        this.response.body = body || this.response.body || {};
        this.response.redirect = this.request.headers.referer || '/';
    }

    binary(data: any, name?: string) {
        this.response.body = data;
        this.response.template = null;
        this.response.type = 'application/octet-stream';
        if (name) this.response.disposition = `attachment; filename="${encodeRFC5987ValueChars(name)}"`;
    }

    async init() {
        if (!argv.options.benchmark) await this.limitRate('global', 5, 88);
        if (!this.noCheckPermView && !this.user.hasPriv(PRIV.PRIV_VIEW_ALL_DOMAIN)) this.checkPerm(PERM.PERM_VIEW);
        this.loginMethods = Object.keys(global.Hydro.module.oauth)
            .map((key) => ({
                id: key,
                icon: global.Hydro.module.oauth[key].icon,
                text: global.Hydro.module.oauth[key].text,
            }));
    }

    async onerror(error: HydroError) {
        if (!error.msg) error.msg = () => error.message;
        if (error instanceof UserFacingError && !process.env.DEV) error.stack = '';
        if (!(error instanceof NotFoundError)) {
            // eslint-disable-next-line max-len
            logger.error(`User: ${this.user._id}(${this.user.uname}) ${this.request.method}: /d/${this.domain._id}${this.request.path}`, error.msg(), error.params);
            if (error.stack) logger.error(error.stack);
        }
        if (this.user?._id === 0 && (error instanceof PermissionError || error instanceof PrivilegeError)) {
            this.response.redirect = this.ctx.getUrl('user_login', {
                query: {
                    redirect: (this.ctx.originalPath || this.request.path) + this.ctx.search,
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

async function serial(name: string, ...args: any[]) {
    const r = await (bus.serial as any)(name, ...args);
    if (r instanceof Error) throw r;
    return r;
}

async function handle(ctx: KoaContext, HandlerClass, checker) {
    const {
        args, request, response, user, domain, UiContext,
    } = ctx.HydroContext;
    Object.assign(args, ctx.params);
    const h = new HandlerClass(ctx, args, request, response, user, domain, UiContext);
    ctx.handler = h;
    try {
        const method = ctx.method.toLowerCase();
        const operation = (method === 'post' && ctx.request.body.operation)
            ? `_${ctx.request.body.operation}`.replace(/_([a-z])/gm, (s) => s[1].toUpperCase())
            : '';

        await bus.parallel('handler/create', h);

        if (checker) checker.call(h);
        if (method === 'post') {
            if (operation) {
                if (typeof h[`post${operation}`] !== 'function') {
                    throw new InvalidOperationError(operation);
                }
            } else if (typeof h.post !== 'function') {
                throw new MethodNotAllowedError(method);
            }
        } else if (typeof h[method] !== 'function' && typeof h.all !== 'function') {
            throw new MethodNotAllowedError(method);
        }

        const name = HandlerClass.name.replace(/Handler$/, '');
        const steps = [
            'init', 'handler/init', `handler/before-prepare/${name}`, 'handler/before-prepare',
            'log/__prepare', '__prepare', '_prepare', 'prepare',
            'log/__prepareDone', `handler/before/${name}`, 'handler/before',
            'log/__method', 'all', method, 'log/__methodDone',
            ...operation ? [
                `handler/before-operation/${name}`, 'handler/before-operation',
                `post${operation}`, 'log/__operationDone',
            ] : [],
            `handler/after/${name}`, 'handler/after', 'cleanup',
            `handler/finish/${name}`, 'handler/finish',
        ];

        let current = 0;
        while (current < steps.length) {
            const step = steps[current];
            let control;
            if (step.startsWith('log/')) h.args[step.slice(4)] = Date.now();
            // eslint-disable-next-line no-await-in-loop
            else if (step.startsWith('handler/')) control = await serial(step, h);
            // eslint-disable-next-line no-await-in-loop
            else if (typeof h[step] === 'function') control = await h[step](args);
            if (control) {
                const index = steps.findIndex((i) => control === i);
                if (index === -1) throw new Error(`Invalid control: ${control}`);
                if (index <= current) {
                    logger.warn('Returning to previous step is not recommended:', step, '->', control);
                }
                current = index;
            } else current++;
        }
    } catch (e) {
        try {
            await bail(`handler/error/${HandlerClass.name.replace(/Handler$/, '')}`, h, e);
            await bail('handler/error', h, e);
            await h.onerror(e);
        } catch (err) {
            h.response.code = 500;
            h.response.body = `${err.message}\n${err.stack}`;
        }
    }
}

const Checker = (permPrivChecker) => {
    let perm: bigint;
    let priv: number;
    let checker = () => { };
    for (const item of permPrivChecker) {
        if (typeof item === 'object') {
            if (typeof item.call !== 'undefined') {
                checker = item;
            } else if (typeof item[0] === 'number') {
                priv = item;
            } else if (typeof item[0] === 'bigint') {
                perm = item;
            }
        } else if (typeof item === 'number') {
            priv = item;
        } else if (typeof item === 'bigint') {
            perm = item;
        }
    }
    return function check(this: Handler) {
        checker();
        if (perm) this.checkPerm(perm);
        if (priv) this.checkPriv(priv);
    };
};

export function Route(name: string, path: string, RouteHandler: any, ...permPrivChecker) {
    router.all(name, path, (ctx) => handle(ctx as any, RouteHandler, Checker(permPrivChecker)));
    return router.disposeLastOp;
}

export class ConnectionHandler extends HandlerCommon {
    conn: WebSocket;

    send(data: any) {
        this.conn.send(JSON.stringify(data, serializer(this.user?.hasPerm(PERM.PREM_VIEW_DISPLAYNAME))));
    }

    close(code: number, reason: string) {
        this.conn.close(code, reason);
    }

    onerror(err: HydroError) {
        if (err instanceof UserFacingError) err.stack = this.ctx.HydroContext.request.path;
        if (!(err instanceof NotFoundError)
            && !((err instanceof PrivilegeError || err instanceof PermissionError) && this.user?._id === 0)) {
            logger.error(`Path:${this.ctx.HydroContext.request.path}, User:${this.user?._id}(${this.user?.uname})`);
            logger.error(err);
        }
        this.send({
            error: {
                name: err.name,
                params: err.params || [],
            },
        });
        this.close(4000, err.toString());
    }
}

export function Connection(
    name: string, prefix: string,
    RouteConnHandler: any,
    ...permPrivChecker: Array<number | bigint | Function>
) {
    const checker = Checker(permPrivChecker);
    router.ws(prefix, async (conn, _, ctx) => {
        const {
            args, request, response, user, domain, UiContext,
        } = ctx.HydroContext;
        const h = new RouteConnHandler(ctx, args, request, response, user, domain, UiContext);
        await bus.parallel('connection/create', h);
        ctx.handler = h;
        h.conn = conn;
        try {
            checker.call(h);
            if (h._prepare) await h._prepare(args);
            if (h.prepare) await h.prepare(args);
            if (h.message) {
                conn.onmessage = (e) => {
                    h.message(JSON.parse(e.data.toString()));
                };
            }
            conn.onclose = () => {
                bus.emit('connection/close', h);
                h.cleanup?.(args);
            };
            await bus.parallel('connection/active', h);
        } catch (e) {
            await h.onerror(e);
        }
    });
    return router.disposeLastOp;
}

class NotFoundHandler extends Handler {
    prepare() { throw new NotFoundError(this.request.path); }
    all() { }
}

class RouteService extends Service {
    static readonly methods = ['Route', 'Connection'];
    constructor(ctx) {
        super(ctx, 'server', true);
    }

    // eslint-disable-next-line @typescript-eslint/naming-convention
    Route(...args: Parameters<typeof Route>) {
        const res = Route(...args);
        this.caller?.on('dispose', () => res());
    }

    // eslint-disable-next-line @typescript-eslint/naming-convention
    Connection(...args: Parameters<typeof Connection>) {
        const res = Connection(...args);
        this.caller?.on('dispose', () => res());
    }
}

export async function apply(pluginContext) {
    Context.service('server', RouteService);
    pluginContext.server = new RouteService(pluginContext);
    app.keys = system.get('session.keys') as unknown as string[];
    if (process.env.HYDRO_CLI) return;
    const proxyMiddleware = proxy('/fs', {
        target: builtinConfig.file.endPoint,
        changeOrigin: true,
        rewrite: (p) => p.replace('/fs', ''),
    });
    app.use(async (ctx, next) => {
        if (!ctx.path.startsWith('/fs/')) return await next();
        if (ctx.request.search.toLowerCase().includes('x-amz-credential')) return await proxyMiddleware(ctx, next);
        ctx.request.path = ctx.path = ctx.path.split('/fs')[1];
        return await next();
    });
    app.use(Compress());
    app.use(async (ctx, next) => {
        for (const key in captureAllRoutes) {
            if (ctx.path.startsWith(key)) return captureAllRoutes[key](ctx, next);
        }
        return next();
    });
    for (const addon of global.addons) {
        const dir = resolve(addon, 'public');
        if (!fs.existsSync(dir)) continue;
        app.use(cache(dir, {
            maxAge: argv.options.public ? 0 : 24 * 3600 * 1000,
        }));
    }
    if (process.env.DEV) {
        app.use(async (ctx: Koa.Context, next: Function) => {
            const startTime = Date.now();
            await next();
            const endTime = Date.now();
            if (ctx.nolog || ctx.response.headers.nolog) return;
            ctx._remoteAddress = ctx.request.ip;
            logger.debug(`${ctx.request.method} /${ctx.domainId || 'system'}${ctx.request.path} \
${ctx.response.status} ${endTime - startTime}ms ${ctx.response.length}`);
        });
    }
    app.use(Body({
        multipart: true,
        jsonLimit: '8mb',
        formLimit: '8mb',
        formidable: {
            maxFileSize: parseMemoryMB(system.get('server.upload') || '256m') * 1024 * 1024,
        },
    }));
    const layers = [baseLayer, rendererLayer(router, logger), responseLayer(logger), userLayer];
    app.use(async (ctx, next) => await next().catch(console.error)).use(domainLayer);
    app.use(router.routes()).use(router.allowedMethods());
    layers.forEach((layer) => router.use(layer as any));
    layers.forEach((layer) => app.use(layer as any));
    app.use((ctx) => handle(ctx, NotFoundHandler, () => true));
    wsServer.on('connection', async (socket, request) => {
        const ctx: any = app.createContext(request, {} as any);
        await domainLayer(ctx, () => baseLayer(ctx, () => layers[1](ctx, () => userLayer(ctx, () => { }))));
        for (const manager of router.wsStack) {
            if (manager.accept(socket, request, ctx)) return;
        }
        socket.close();
    });
    const port = system.get('server.port');
    pluginContext.on('app/ready', async () => {
        await new Promise((r) => {
            httpServer.listen(argv.options.port || port, () => {
                logger.success('Server listening at: %d', argv.options.port || port);
                r(true);
            });
        });
        pluginContext.on('dispose', () => {
            httpServer.close();
            wsServer.close();
        });
    });
}

global.Hydro.service.server = {
    ...decorators,
    app,
    httpServer,
    wsServer,
    router,
    captureAllRoutes,
    HandlerCommon,
    Handler,
    ConnectionHandler,
    Route,
    Connection,
    apply,
};
