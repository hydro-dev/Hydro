import http from 'http';
import { tmpdir } from 'os';
import { join } from 'path';
import type { Files } from 'formidable';
import fs from 'fs-extra';
import Koa from 'koa';
import Body from 'koa-body';
import Compress from 'koa-compress';
import { Shorty } from 'shorty.js';
import WebSocket from 'ws';
import { Counter, isClass, parseMemoryMB } from '@hydrooj/utils/lib/utils';
import { Context, Service } from '../context';
import {
    CsrfTokenError, HydroError, InvalidOperationError,
    MethodNotAllowedError, NotFoundError, PermissionError,
    PrivilegeError, UserFacingError,
} from '../error';
import { DomainDoc } from '../interface';
import serializer from '../lib/serializer';
import { Types } from '../lib/validator';
import { Logger } from '../logger';
import { User } from '../model/user';
import { errorMessage } from '../utils';
import * as decorators from './decorators';
import { Router } from './router';

// https://developer.mozilla.org/en-US/docs/Web/JavaScript/Reference/Global_Objects/encodeURIComponent
export function encodeRFC5987ValueChars(str: string) {
    return (
        encodeURIComponent(str)
            // Note that although RFC3986 reserves "!", RFC5987 does not,
            // so we do not need to escape it
            .replace(/['()]/g, escape) // i.e., %27 %28 %29
            .replace(/\*/g, '%2A')
            // The following are not required for percent-encoding per RFC5987,
            // so we can allow for a little better readability over the wire: |`^
            .replace(/%(?:7C|60|5E)/g, unescape)
    );
}

export * from './decorators';
export * from '../lib/validator';

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
    querystring: string;
    path: string;
    originalPath: string;
    params: any;
    referer: string;
    json: boolean;
    websocket: boolean;
}
export interface HydroResponse {
    body: any;
    type: string;
    status: number;
    template?: string;
    /** If set, and pjax content was request from client,
     *  The template will be used for rendering.
     */
    pjax?: string;
    redirect?: string;
    disposition?: string;
    etag?: string;
    attachment: (name: string, stream?: any) => void;
    addHeader: (name: string, value: string) => void;
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
    request: Koa.Request & { body: any, files: Files };
    session: Record<string, any>;
    render: (name: string, args: any) => Promise<void>;
    renderHTML: (name: string, args: any) => string | Promise<string>;
    getUrl: (name: string, args: any) => string;
    translate: (key: string) => string;
}

const logger = new Logger('server');
/** @deprecated */
export const koa = new Koa<Koa.DefaultState, KoaContext>({
    keys: [Math.random().toString(16).substring(2)],
});
export const router = new Router();
export const httpServer = http.createServer(koa.callback());
export const wsServer = new WebSocket.Server({ server: httpServer });
koa.on('error', (error) => {
    if (error.code !== 'EPIPE' && error.code !== 'ECONNRESET' && !error.message.includes('Parse Error')) {
        logger.error('Koa app-level error', { error });
    }
});
wsServer.on('error', (error) => {
    console.log('Websocket server error:', error);
});

export class HandlerCommon {
    render: (name: string, args?: any) => Promise<void>;
    renderHTML: (name: string, args?: any) => string | Promise<string>;
    url: (name: string, args?: any) => string;
    translate: (key: string) => string;
    session: Record<string, any>;
    ctx: Context;
    /** @deprecated */
    domainId: string;

    constructor(
        public context: KoaContext, public readonly args: Record<string, any>,
        public readonly request: HydroRequest, public response: HydroResponse,
        public user: User, public domain: DomainDoc, public UiContext: Record<string, any>,
    ) {
        this.render = context.render.bind(context);
        this.renderHTML = context.renderHTML.bind(context);
        this.url = context.getUrl.bind(context);
        this.translate = context.translate.bind(context);
        this.session = context.session;
        this.domainId = args.domainId;
        this.ctx = global.app.extend({
            domain: this.domain,
        });
    }

    renderTitle(str: string) {
        const name = this.ctx.setting.get('server.name');
        if (this.UiContext.extraTitleContent) return `${this.translate(str)} - ${this.UiContext.extraTitleContent} - ${name}`;
        return `${this.translate(str)} - ${name}`;
    }

    checkPerm(..._: bigint[]) {
        throw new Error('checkPerm was not implemented');
    }

    checkPriv(..._: number[]) {
        throw new Error('checkPriv was not implemented');
    }
}

export class Handler extends HandlerCommon {
    loginMethods: any;
    noCheckPermView = false;
    notUsage = false;
    allowCors = false;
    __param: Record<string, decorators.ParamOption<any>[]>;

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
        if (this.request.method === 'post' && this.request.headers.referer && !this.context.cors && !this.allowCors) {
            try {
                const host = new URL(this.request.headers.referer).host;
                if (host !== this.request.host) throw new CsrfTokenError(host);
            } catch (e) {
                throw e instanceof CsrfTokenError ? e : new CsrfTokenError();
            }
        }
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

async function serial(name: string, ...args: any[]) {
    const r = await (global.app.serial as any)(name, ...args);
    if (r instanceof Error) throw r;
    return r;
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

export class ConnectionHandler extends HandlerCommon {
    conn: WebSocket;
    compression: Shorty;
    counter = 0;

    resetCompression() {
        this.counter = 0;
        this.compression = new Shorty();
        this.conn.send('shorty');
    }

    send(data: any) {
        let payload = JSON.stringify(data, serializer(false, this));
        if (this.compression) {
            if (this.counter > 1000) this.resetCompression();
            payload = this.compression.deflate(payload);
            this.counter++;
        }
        this.conn.send(payload);
    }

    close(code: number, reason: string) {
        this.conn.close(code, reason);
    }

    onerror(err: HydroError) {
        if (err instanceof UserFacingError) err.stack = this.request.path;
        if (!(err instanceof NotFoundError)
            && !((err instanceof PrivilegeError || err instanceof PermissionError) && this.user?._id === 0)) {
            logger.error(`Path:${this.request.path}, User:${this.user?._id}(${this.user?.uname})`);
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

class NotFoundHandler extends Handler {
    prepare() { throw new NotFoundError(this.request.path); }
    all() { }
}

async function executeMiddlewareStack(context: any, middlewares: { name: string, func: Function }[]) {
    const first = middlewares[0];
    context.__timers ||= {};
    context.__timers[`${first.name}.start`] = Date.now();
    const next = () => executeMiddlewareStack(context, middlewares.slice(1));
    try {
        return await first.func(context, next);
    } finally {
        context.__timers[`${first.name}.end`] = Date.now();
    }
}

interface RouteServiceConfig {
    keys: string[];
    proxy: boolean;
    cors: string;
    upload: string;
    port: number;
}

export class RouteService extends Service {
    private registry = {};
    private registrationCount = Counter();
    private serverLayers = [];
    private wsLayers = [];
    private captureAllRoutes = {};

    server = koa;
    router = router;
    HandlerCommon = HandlerCommon;
    Handler = Handler;
    ConnectionHandler = ConnectionHandler;

    constructor(ctx: Context, public config: RouteServiceConfig) {
        super(ctx, 'server', true);
        ctx.mixin('server', ['Route', 'Connection', 'withHandlerClass']);
    }

    async start() {
        this.server.keys = this.config.keys;
        this.server.proxy = this.config.proxy;
        const corsAllowHeaders = 'x-requested-with, accept, origin, content-type, upgrade-insecure-requests';
        this.server.use(Compress());
        this.server.use(async (ctx, next) => {
            if (ctx.request.headers.origin) {
                const host = new URL(ctx.request.headers.origin).host;
                if (host !== ctx.request.headers.host && `,${this.config.cors || ''},`.includes(`,${host},`)) {
                    ctx.set('Access-Control-Allow-Credentials', 'true');
                    ctx.set('Access-Control-Allow-Origin', ctx.request.headers.origin);
                    ctx.set('Access-Control-Allow-Headers', corsAllowHeaders);
                    ctx.set('Vary', 'Origin');
                    ctx.cors = true;
                }
            }
            if (ctx.request.method.toLowerCase() === 'options') {
                ctx.body = 'ok';
                return null;
            }
            for (const key in this.captureAllRoutes) {
                if (ctx.path.startsWith(key)) return this.captureAllRoutes[key](ctx, next);
            }
            return await next();
        });
        if (process.env.DEV) {
            this.server.use(async (ctx: Koa.Context, next: Function) => {
                const startTime = Date.now();
                try {
                    await next();
                } finally {
                    const endTime = Date.now();
                    if (!(ctx.nolog || ctx.response.headers.nolog)) {
                        logger.debug(`${ctx.request.method} /${ctx.domainId || 'system'}${ctx.request.path} \
    ${ctx.response.status} ${endTime - startTime}ms ${ctx.response.length}`);
                    }
                }
            });
        }
        const uploadDir = join(tmpdir(), 'hydro', 'upload', process.env.NODE_APP_INSTANCE || '0');
        fs.ensureDirSync(uploadDir);
        logger.debug('Using upload dir: %s', uploadDir);
        this.server.use(Body({
            multipart: true,
            jsonLimit: '8mb',
            formLimit: '8mb',
            formidable: {
                uploadDir,
                maxFileSize: parseMemoryMB(this.config.upload) * 1024 * 1024,
                keepExtensions: true,
            },
        }));
        this.ctx.on('app/exit', () => {
            fs.emptyDirSync(uploadDir);
        });

        this.server.use((ctx) => executeMiddlewareStack(ctx, [
            ...this.serverLayers,
            { name: 'route', func: router.routes() },
            { name: '404', func: (c) => this.handleHttp(c, NotFoundHandler, () => true) },
        ]).catch(console.error));
        wsServer.on('connection', async (socket, request) => {
            socket.on('error', (err) => {
                logger.warn('Websocket Error: %s', err.message);
                try {
                    socket.close(1003, 'Websocket Error');
                } catch (e) { }
            });
            socket.pause();
            const ctx: any = koa.createContext(request, {} as any);
            await executeMiddlewareStack(ctx, this.wsLayers);
            for (const manager of router.wsStack) {
                if (manager.accept(socket, request, ctx)) return;
            }
            socket.close();
        });
        this.ctx.on('app/listen', async () => {
            this.ctx.on('dispose', () => {
                httpServer.close();
                wsServer.close();
            });
            await new Promise((r) => {
                httpServer.listen(this.config.port, () => {
                    logger.success('Server listening at: %d', this.config.port);
                    r(true);
                });
            });
        });
    }

    private async handleHttp(ctx: KoaContext, HandlerClass, checker) {
        const {
            args, request, response, user, domain, UiContext,
        } = ctx.HydroContext;
        Object.assign(args, ctx.params);
        const h = new HandlerClass(ctx, args, request, response, user, domain, UiContext);
        ctx.handler = h;
        const method = ctx.method.toLowerCase();
        try {
            const operation = (method === 'post' && ctx.request.body?.operation)
                ? `_${ctx.request.body.operation}`.replace(/_([a-z])/gm, (s) => s[1].toUpperCase())
                : '';

            await this.ctx.parallel('handler/create', h);

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
                'init', 'handler/init',
                `handler/before-prepare/${name}#${method}`, `handler/before-prepare/${name}`, 'handler/before-prepare',
                'log/__prepare', '__prepare', '_prepare', 'prepare', 'log/__prepareDone',
                `handler/before/${name}#${method}`, `handler/before/${name}`, 'handler/before',
                'log/__method', 'all', method, 'log/__methodDone',
                ...operation ? [
                    `handler/before-operation/${name}`, 'handler/before-operation',
                    `post${operation}`, 'log/__operationDone',
                ] : [], 'after',
                `handler/after/${name}#${method}`, `handler/after/${name}`, 'handler/after',
                'cleanup',
                `handler/finish/${name}#${method}`, `handler/finish/${name}`, 'handler/finish',
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
                await serial(`handler/error/${HandlerClass.name.replace(/Handler$/, '')}`, h, e);
                await serial('handler/error', h, e);
                await h.onerror(e);
            } catch (err) {
                h.response.code = 500;
                h.response.type = 'text/plain';
                h.response.body = `${err.message}\n${err.stack}`;
            }
        }
    }

    private async handleWS(ctx: KoaContext, HandlerClass, checker, conn, layer) {
        const {
            args, request, response, user, domain, UiContext,
        } = ctx.HydroContext;
        const h = new HandlerClass(ctx, args, request, response, user, domain, UiContext);
        await this.ctx.parallel('connection/create', h);
        ctx.handler = h;
        h.conn = conn;
        const disposables = [];
        try {
            checker.call(h);
            if (args.shorty) h.resetCompression();
            if (h._prepare) await h._prepare(args);
            if (h.prepare) await h.prepare(args);
            // eslint-disable-next-line @typescript-eslint/no-shadow
            for (const { name, target } of h.__subscribe || []) disposables.push(this.ctx.on(name, target.bind(h)));
            let lastHeartbeat = Date.now();
            let closed = false;
            let interval: NodeJS.Timeout;
            const clean = () => {
                if (closed) return;
                closed = true;
                this.ctx.emit('connection/close', h);
                layer.clients.delete(conn);
                if (interval) clearInterval(interval);
                for (const d of disposables) d();
                h.cleanup?.(args);
            };
            interval = setInterval(() => {
                if (Date.now() - lastHeartbeat > 80000) {
                    clean();
                    conn.terminate();
                }
                if (Date.now() - lastHeartbeat > 30000) conn.send('ping');
            }, 40000);
            conn.on('pong', () => {
                lastHeartbeat = Date.now();
            });
            conn.onmessage = (e) => {
                lastHeartbeat = Date.now();
                if (e.data === 'pong') return;
                if (e.data === 'ping') {
                    conn.send('pong');
                    return;
                }
                let payload;
                try {
                    payload = JSON.parse(e.data.toString());
                } catch {
                    conn.close();
                }
                try {
                    h.message?.(payload);
                } catch (err) {
                    logger.error(e);
                }
            };
            await this.ctx.parallel('connection/active', h);
            if (conn.readyState === conn.OPEN) {
                conn.on('close', clean);
                conn.resume();
            } else clean();
        } catch (e) {
            await h.onerror(e);
        }
    }

    private register(type: 'route' | 'conn', _: string, path: string, HandlerClass: any, ...permPrivChecker) {
        const name = HandlerClass.name;
        if (!isClass(HandlerClass)) throw new Error('Invalid registration.');
        if (this.registrationCount[name] && this.registry[name] !== HandlerClass) {
            logger.warn('Route with name %s already exists.', name);
        }
        this.registry[name] = HandlerClass;
        this.registrationCount[name]++;
        if (type === 'route') {
            router.all(name, path, (ctx) => this.handleHttp(ctx as any, HandlerClass, Checker(permPrivChecker)));
        } else {
            const checker = Checker(permPrivChecker);
            const layer = router.ws(path, async (conn, _req, ctx) => {
                await this.handleWS(ctx as any, HandlerClass, checker, conn, layer);
            });
        }
        const dispose = router.disposeLastOp;
        this.ctx.parallel(`handler/register/${name}`, HandlerClass);
        this[Context.current]?.on('dispose', () => {
            this.registrationCount[name]--;
            if (!this.registrationCount[name]) delete this.registry[name];
            dispose();
        });
    }

    public withHandlerClass(name: string, callback: (HandlerClass: typeof HandlerCommon) => any) {
        if (this.registry[name]) callback(this.registry[name]);
        this.ctx.on(`handler/register/${name}`, callback);
        this[Context.current]?.on('dispose', () => {
            this.ctx.off(`handler/register/${name}`, callback);
        });
    }

    // eslint-disable-next-line @typescript-eslint/naming-convention
    public Route(name: string, path: string, RouteHandler: any, ...permPrivChecker) {
        return this.register('route', name, path, RouteHandler, ...permPrivChecker);
    }

    // eslint-disable-next-line @typescript-eslint/naming-convention
    public Connection(name: string, path: string, RouteHandler: any, ...permPrivChecker) {
        return this.register('conn', name, path, RouteHandler, ...permPrivChecker);
    }

    public addHttpLayer(name: string, func: any) {
        this.serverLayers.push({ name, func });
    }

    public addWSLayer(name: string, func: any) {
        this.wsLayers.push({ name, func });
    }

    public addLayer(name: string, layer: any) {
        this.addHttpLayer(name, layer);
        this.addWSLayer(name, layer);
    }

    public addCaptureRoute(prefix: string, cb: any) {
        this.captureAllRoutes[prefix] = cb;
    }
}

declare module '../context' {
    interface Context {
        server: RouteService;
    }
}

// export const using = ['setting'];
export async function apply(ctx: Context, config) {
    ctx.provide('server', undefined, true);
    ctx.server = new RouteService(ctx, config);
}

global.Hydro.service.server = {
    ...decorators,
    Types,
    // @ts-ignore
    app: koa,
    httpServer,
    wsServer,
    router,
    RouteService,
    HandlerCommon,
    Handler,
    ConnectionHandler,
    apply,
};
