/* eslint-disable ts/no-unsafe-declaration-merging */
import http from 'http';
import { tmpdir } from 'os';
import { join } from 'path';
import { PassThrough } from 'stream';
import { Context as CordisContext, Service } from 'cordis';
import type { Files } from 'formidable';
import fs from 'fs-extra';
import Koa from 'koa';
import Body from 'koa-body';
import Compress from 'koa-compress';
import Schema from 'schemastery';
import { Shorty } from 'shorty.js';
import { WebSocket, WebSocketServer } from 'ws';
import {
    Counter, errorMessage, isClass, Logger, parseMemoryMB,
} from '@hydrooj/utils/lib/utils';
import base from './base';
import * as decorators from './decorators';
import {
    CsrfTokenError, HydroError, InvalidOperationError,
    MethodNotAllowedError, NotFoundError, UserFacingError,
} from './error';
import type { KnownHandlers } from './interface';
import { Router } from './router';
import serializer from './serializer';

export { WebSocket, WebSocketServer } from 'ws';

export const kHandler = Symbol.for('hydro.handler');

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

async function forkContextWithScope<C extends CordisContext>(ctx: C) {
    const scope = ctx.plugin(() => { });
    await scope;
    const dispose = () => scope.dispose();
    return {
        scope,
        ctx: scope.ctx,
        dispose,
        [Symbol.asyncDispose]: dispose,
    };
}

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
    /**
     * If set, and pjax content was request from client,
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
    args: Record<string, any>;
    UiContext: Record<string, any>;
    domain: { _id: string };
    user: { _id: number };
}
export type KoaContext = Koa.Context & {
    HydroContext: HydroContext;
    handler: any;
    request: Koa.Request & { body: any, files: Files };
    session: Record<string, any>;
    holdFiles: (string | File)[];
};

export interface TextRenderer {
    output: 'html' | 'json' | 'text';
    render: (name: string, args: Record<string, any>, context: Record<string, any>) => string | Promise<string>;
}
export interface BinaryRenderer {
    output: 'binary';
    render: (name: string, args: Record<string, any>, context: Record<string, any>) => Buffer | Promise<Buffer>;
}
export type Renderer = (BinaryRenderer | TextRenderer) & {
    name: string;
    accept: readonly string[];
    priority: number;
    asFallback: boolean;
};

const logger = new Logger('server');
/** @deprecated */
export const koa = new Koa<Koa.DefaultState, KoaContext>({
    keys: [Math.random().toString(16).substring(2)],
});
export const router = new Router();
export const httpServer = http.createServer(koa.callback());
export const wsServer = new WebSocketServer({ server: httpServer });
koa.on('error', (error) => {
    if (!['ECONNRESET', 'EPIPE', 'ECONNABORTED'].includes(error.code) && !error.message.includes('Parse Error')) {
        logger.error('Koa app-level error', { error });
    }
});
wsServer.on('error', (error) => {
    console.log('Websocket server error:', error);
});

export interface UserModel {
    _id: number;
}

export interface HandlerCommon<C> { } // eslint-disable-line ts/no-unused-vars
export class HandlerCommon<C> {
    static [kHandler]: string | boolean = 'HandlerCommon';
    session: Record<string, any>;
    args: Record<string, any>;
    request: HydroRequest;
    response: HydroResponse;
    UiContext: Record<string, any>;
    user: UserModel;

    constructor(public context: KoaContext, public ctx: C) {
        this.renderHTML = this.renderHTML.bind(this);
        this.url = this.url.bind(this);
        this.session = context.session;
        this.args = context.HydroContext.args;
        this.request = context.HydroContext.request;
        this.response = context.HydroContext.response;
        this.UiContext = context.HydroContext.UiContext;
    }

    checkPerm(..._: bigint[]) {
        throw new Error('checkPerm was not implemented');
    }

    checkPriv(..._: number[]) {
        throw new Error('checkPriv was not implemented');
    }

    url(name: string, ...kwargsList: Record<string, any>[]) {
        if (name === '#') return '#';
        let res = '#';
        const args: any = Object.create(null);
        const query: any = Object.create(null);
        for (const kwargs of kwargsList) {
            for (const key in kwargs) {
                args[key] = kwargs[key].toString().replace(/\//g, '%2F');
            }
            for (const key in kwargs.query || {}) {
                query[key] = kwargs.query[key].toString();
            }
        }
        try {
            const { anchor } = args;
            res = router.url(name, args, { query }).toString();
            if (anchor) res = `${res}#${anchor}`;
        } catch (e) {
            logger.warn(e.message);
            logger.info('%s %o', name, args);
            if (!e.message.includes('Expected') || !e.message.includes('to match')) logger.info('%s', e.stack);
        }
        return res;
    }

    translate(str: string) {
        return str;
    }

    renderHTML(templateName: string, args: Record<string, any>) {
        const renderers = Object.values((this.ctx as any).server.renderers as Record<string, Renderer>)
            .filter((r) => r.accept.includes(templateName) || r.asFallback);
        const topPrio = renderers.sort((a, b) => b.priority - a.priority)[0];
        const engine = topPrio?.render || (() => JSON.stringify(args, serializer(false, this)));
        return engine(templateName, args, {
            handler: this,
            UserContext: this.user,
            url: this.url,
            _: this.translate,
        });
    }
}

export class Handler<C = CordisContext> extends HandlerCommon<C> {
    static [kHandler] = 'Handler';

    loginMethods: any;
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

    holdFile(name: string | File) {
        this.context.holdFiles.push(name);
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
        console.error(`Error on user request: ${error.msg()}\n`, error);
        if (error instanceof UserFacingError && !process.env.DEV) error.stack = '';
        this.response.status = error instanceof UserFacingError ? error.code : 500;
        this.response.template = error instanceof UserFacingError ? 'error.html' : 'bsod.html';
        this.response.body = {
            UserFacingError,
            error: { message: error.msg(), params: error.params, stack: errorMessage(error.stack || '') },
        };
    }
}

export class ConnectionHandler<C> extends HandlerCommon<C> {
    static [kHandler] = 'ConnectionHandler';

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
        else console.error('Error on user websocket:', err);
        this.send({
            error: {
                name: err.name,
                params: err.params || [],
            },
        });
        this.close(4000, err.toString());
    }
}

export class NotFoundHandler extends Handler<CordisContext> {
    prepare() { throw new NotFoundError(this.request.path); }
    all() { }
}

function executeMiddlewareStack(context: any, middlewares: { name: string, func: Function }[]) {
    let index = -1;
    context.__timers ||= {};
    function dispatch(i) {
        if (i <= index) return Promise.reject(new Error('next() called multiple times'));
        index = i;
        if (!middlewares[i]) return Promise.resolve();
        const name = middlewares[i].name;
        const fn = middlewares[i].func;
        context.__timers[`${name}.start`] = Date.now();
        try {
            return Promise.resolve(fn(context, dispatch.bind(null, i + 1))).finally(() => {
                context.__timers[`${name}.end`] = Date.now();
            });
        } catch (e) {
            return Promise.reject(e);
        } finally {
            context.__timers[`${name}.end`] = Date.now();
        }
    }
    return dispatch(0);
}

export class WebService<C extends CordisContext = CordisContext> extends Service<never, C> {
    static Config = Schema.object({
        keys: Schema.array(Schema.string()),
        proxy: Schema.boolean(),
        cors: Schema.string(),
        upload: Schema.string(),
        port: Schema.number(),
        host: Schema.string(),
        xff: Schema.string(),
        xhost: Schema.string(),
        enableSSE: Schema.boolean(),
    });

    private registry: Record<string, any> = Object.create(null);
    private registrationCount = Counter();
    private serverLayers = [];
    private handlerLayers = [];
    private wsLayers = [];
    private captureAllRoutes = Object.create(null);
    private customDefaultContext: C;
    private activeHandlers: Map<Handler<C>, { start: number, name: string }> = new Map();

    renderers: Record<string, Renderer> = Object.create(null);
    server = koa;
    router = router;
    HandlerCommon = HandlerCommon;
    Handler = Handler;
    ConnectionHandler = ConnectionHandler;

    constructor(ctx: C, public config: ReturnType<typeof WebService.Config>) {
        super(ctx, 'server');
        ctx.mixin('server', ['Route', 'Connection', 'withHandlerClass']);
        this.server.keys = this.config.keys;
        this.server.proxy = this.config.proxy;
        const corsAllowHeaders = 'x-requested-with, accept, origin, content-type, upgrade-insecure-requests';
        this.server.use(Compress());
        this.server.use(async (c, next) => {
            if (c.request.headers.origin && this.config.cors) {
                try {
                    const host = new URL(c.request.headers.origin).host;
                    if (host !== c.request.headers.host && `,${this.config.cors},`.includes(`,${host},`)) {
                        c.set('Access-Control-Allow-Credentials', 'true');
                        c.set('Access-Control-Allow-Origin', c.request.headers.origin);
                        c.set('Access-Control-Allow-Headers', corsAllowHeaders);
                        c.set('Vary', 'Origin');
                        c.cors = true;
                    }
                } catch (e) {
                    // invalid origin header, ignore
                }
            }
            if (c.request.method.toLowerCase() === 'options') {
                c.body = 'ok';
                return null;
            }
            for (const key in this.captureAllRoutes) {
                if (c.path.startsWith(key)) return this.captureAllRoutes[key](c, next);
            }
            return await next();
        });
        if (process.env.DEV) {
            this.server.use(async (c: Koa.Context, next: Function) => {
                const startTime = Date.now();
                try {
                    await next();
                } finally {
                    const endTime = Date.now();
                    if (!c.nolog && !c.response.headers.nolog) {
                        logger.debug(`${c.request.method} /${c.domainId || 'system'}${c.request.path} \
${c.response.status} ${endTime - startTime}ms ${c.response.length}`);
                    }
                }
            });
        }
        if (this.config.upload) {
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
            this.server.use(async (c, next) => {
                c.holdFiles = [];
                try {
                    await next();
                } finally {
                    if (Object.keys(c.request.files || {}).length) {
                        for (const k in c.request.files) {
                            if (c.holdFiles.includes(k)) continue;
                            const files = Array.isArray(c.request.files[k]) ? c.request.files[k] : [c.request.files[k]];
                            for (const f of files) if (!c.holdFiles.includes(f as any)) fs.rmSync(f.filepath);
                        }
                    }
                }
            });
            this.ctx.effect(() => () => {
                fs.emptyDirSync(uploadDir);
            });
            // if killed by ctrl-c, on('dispose') will not be called
            process.on('exit', () => {
                fs.emptyDirSync(uploadDir);
            });
        } else {
            this.server.use(Body({
                multipart: true,
                jsonLimit: '8mb',
                formLimit: '8mb',
            }));
        }
        this.router.use((c, next) => executeMiddlewareStack(c, [
            ...this.handlerLayers,
            { name: 'logic', func: next },
        ]).catch(console.error));
        this.server.use((c) => executeMiddlewareStack(c, [
            ...this.serverLayers,
            { name: 'routes', func: router.routes() },
            { name: 'methods', func: router.allowedMethods() },
            ...this.handlerLayers,
            {
                name: '404',
                func: (t) => this.handleHttp(t, NotFoundHandler, () => true, this.customDefaultContext || this.ctx),
            },
        ]));
        this.addLayer('base', base(logger, this.config.xff, this.config.xhost));
        wsServer.on('connection', async (socket, request) => {
            socket.on('error', (err) => {
                logger.warn('Websocket Error: %s', err.message);
                try {
                    socket.close(1003, 'Websocket Error');
                } catch (e) { }
            });
            socket.pause();
            const KoaContext: any = koa.createContext(request, {} as any);
            await executeMiddlewareStack(KoaContext, this.wsLayers);
            for (const manager of router.wsStack) {
                if (manager.accept(socket, request, KoaContext)) return;
            }
            socket.close();
        });
    }

    public statistics() {
        const count = Counter();
        for (const [, t] of this.activeHandlers.entries()) {
            count[t.name]++;
        }
        return count;
    }

    async listen() {
        this.ctx.effect(() => () => {
            httpServer.close();
            wsServer.close();
        });
        await new Promise((r) => {
            httpServer.listen(this.config.port, this.config.host || '127.0.0.1', () => {
                logger.success('Server listening at: %c', `${this.config.host || '127.0.0.1'}:${this.config.port}`);
                r(true);
            });
        });
    }

    private async handleHttp(ctx: KoaContext, HandlerClass, checker, savedContext: C) {
        const { args } = ctx.HydroContext;
        Object.assign(args, ctx.params);
        await using sub = await forkContextWithScope(savedContext);
        const h = new HandlerClass(ctx, sub.ctx);
        ctx.handler = h;
        const method = ctx.method.toLowerCase();
        const name = ((Object.hasOwn(HandlerClass, kHandler) && typeof HandlerClass[kHandler] === 'string')
            ? HandlerClass[kHandler] : HandlerClass.name).replace(/Handler$/, '');
        this.activeHandlers.set(h, { start: Date.now(), name });
        try {
            const operation = (method === 'post' && ctx.request.body?.operation)
                // eslint-disable-next-line regexp/no-unused-capturing-group
                ? `_${ctx.request.body.operation}`.replace(/_([a-z])/g, (s) => s[1].toUpperCase())
                : '';

            // FIXME: should pass type check
            await (this.ctx.parallel as any)('handler/create', h, 'http');
            await (this.ctx.parallel as any)('handler/create/http', h);

            if (checker) checker.call(h);
            if (typeof h.all !== 'function') {
                if (method === 'post') {
                    if (operation) {
                        if (typeof h[`post${operation}`] !== 'function') {
                            throw new InvalidOperationError(operation);
                        }
                    } else if (typeof h.post !== 'function') {
                        throw new MethodNotAllowedError(method);
                    }
                } else if (typeof h[method] !== 'function') {
                    throw new MethodNotAllowedError(method);
                }
            }

            const steps = [
                'log/__init', 'init', 'handler/init',
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
                'log/__finish',
            ];

            let current = 0;
            while (current < steps.length) {
                const step = steps[current];
                let control;
                if (step.startsWith('log/')) h.args[step.slice(4)] = Date.now();
                // @ts-ignore
                else if (step.startsWith('handler/')) control = await this.ctx.serial(step, h); // eslint-disable-line no-await-in-loop
                // eslint-disable-next-line no-await-in-loop
                else if (typeof h[step] === 'function') control = await h[step](args);
                if (control) {
                    const index = steps.findIndex((i) => control === i);
                    if (index === -1) throw new Error(`Invalid control: ${control} (after step ${step})`);
                    if (index <= current) {
                        logger.warn('Returning to previous step is not recommended:', step, '->', control);
                    }
                    current = index;
                } else current++;
            }
        } catch (e) {
            try {
                // FIXME: should pass type check
                await (this.ctx.serial as any)(`handler/error/${name}`, h, e);
                await (this.ctx.serial as any)('handler/error', h, e);
                await h.onerror(e);
            } catch (err) {
                logger.error(err);
                h.response.status = 500;
                h.response.type = 'text/plain';
                h.response.body = `${err.message}\n${err.stack}`;
            }
        } finally {
            this.activeHandlers.delete(h);
        }
    }

    private async handleWS(ctx: KoaContext, HandlerClass, checker, conn?, layer?, savedContext?) {
        const { args } = ctx.HydroContext;
        const sub = await forkContextWithScope(savedContext);
        const h = new HandlerClass(ctx, sub.ctx);
        let stream: PassThrough;
        if (!conn) {
            // By HTTP
            stream = new PassThrough();
            ctx.request.socket.setTimeout(0);
            ctx.req.socket.setNoDelay(true);
            ctx.req.socket.setKeepAlive(true);
            ctx.set({
                'X-Accel-Buffering': 'no',
                'Content-Type': 'text/event-stream',
                'Cache-Control': 'no-cache',
                Connection: 'keep-alive',
            });
            ctx.HydroContext.request.websocket = true;
            ctx.compress = false;
            conn = {
                close() {
                    stream.end();
                },
                send(data: any) {
                    stream.write(`${args.sse ? 'data: ' : ''}${data}\n${args.sse ? '\n' : ''}`);
                },
            };
        }
        ctx.handler = h;
        h.conn = conn;
        let closed = false;
        this.activeHandlers.set(h, { start: Date.now(), name: HandlerClass.name });

        const clean = async (err?: Error) => {
            if (closed) return;
            closed = true;
            try {
                try {
                    if (err) await h.onerror(err);
                    // FIXME: should pass type check
                    else (this.ctx.emit as any)('connection/close', h);
                } finally {
                    h.active = false;
                    if (layer) layer.clients.delete(conn);
                    if (err && !layer) ctx.status = 500;
                    await h.cleanup?.(args);
                }
            } finally {
                await sub.dispose();
                this.activeHandlers.delete(h);
            }
        };

        try {
            // FIXME: should pass type check
            await (this.ctx.parallel as any)('handler/create', h, 'ws');
            await (this.ctx.parallel as any)('handler/create/ws', h);
            checker.call(h);
            if (args.shorty) h.resetCompression();
            if (h._prepare) await h._prepare(args);
            if (h.prepare) await h.prepare(args);
            for (const { name, target } of h.__subscribe || []) sub.ctx.on(name, target.bind(h));
            if (layer) {
                let lastHeartbeat = Date.now();
                sub.ctx.interval(() => {
                    if (Date.now() - lastHeartbeat > 80000) {
                        clean();
                        conn.terminate();
                    }
                    if (Date.now() - lastHeartbeat > 30000) conn.send('ping');
                }, 40000);
                conn.on('pong', () => {
                    lastHeartbeat = Date.now();
                });
                conn.onmessage = async (e) => {
                    lastHeartbeat = Date.now();
                    if (e.data === 'pong') return;
                    if (e.data === 'ping') {
                        conn.send('pong');
                        return;
                    }
                    let payload;
                    try {
                        payload = JSON.parse(e.data.toString());
                    } catch (err) {
                        await clean(err);
                    }
                    try {
                        await h.message?.(payload);
                    } catch (err) {
                        logger.error(e);
                    }
                };
            } else ctx.body = stream;
            // FIXME: should pass type check
            await (this.ctx.parallel as any)('connection/active', h as any);
            h.active = true;
            if (layer) {
                if (conn.readyState === conn.OPEN) {
                    conn.on('close', () => clean());
                    conn.on('error', (err) => clean(err));
                    conn.resume();
                } else clean();
            } else {
                stream.on('close', () => clean());
                stream.on('error', (err) => clean(err));
            }
        } catch (e) {
            // error during initialization (prepare, hooks)
            await clean(e);
        }
    }

    private register(type: 'route' | 'conn', routeName: string, path: string, HandlerClass: any, ...permPrivChecker) {
        if (!HandlerClass?.[kHandler] || !isClass(HandlerClass)) throw new Error('Invalid registration.');
        const name = ((Object.hasOwn(HandlerClass, kHandler) && typeof HandlerClass[kHandler] === 'string')
            ? HandlerClass[kHandler] : HandlerClass.name).replace(/Handler$/, '');
        if (this.registrationCount[name] && this.registry[name] !== HandlerClass) {
            logger.warn('Route with name %s already exists.', name);
        }
        this.registry[name] = HandlerClass;
        this.registrationCount[name]++;

        const Checker = (args) => {
            let perm: bigint;
            let priv: number;
            let checker = () => { };
            for (const item of args) {
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
            return function check(this: Handler<C>) {
                checker();
                if (perm) this.checkPerm(perm);
                if (priv) this.checkPriv(priv);
            };
        };

        // We hope to use parent context for handler (the context that calls register)
        // So that handler can use services injected before calling register
        const savedContext = Object.hasOwn(this.ctx, Symbol.for('cordis.shadow'))
            ? Object.getPrototypeOf(this.ctx)
            : this.ctx;
        if (type === 'route') {
            router.all(routeName, path, (ctx) => this.handleHttp(ctx as any, HandlerClass, Checker(permPrivChecker), savedContext));
        } else {
            const checker = Checker(permPrivChecker);
            const layer = router.ws(path, async (conn, _req, ctx) => {
                await this.handleWS(ctx as any, HandlerClass, checker, conn, layer, savedContext);
            });
            if (this.config.enableSSE) router.get(path, (ctx) => this.handleWS(ctx as any, HandlerClass, checker, null, null, savedContext));
        }
        const dispose = router.disposeLastOp;
        // @ts-ignore
        this.ctx.parallel(`handler/register/${name}`, HandlerClass);
        this.ctx.effect(() => () => {
            this.registrationCount[name]--;
            if (!this.registrationCount[name]) delete this.registry[name];
            dispose();
        });
    }

    public setDefaultContext(ctx: C) {
        try {
            if (!ctx.server) throw new Error();
        } catch (e) {
            throw new Error('Must provide a valid context with server.');
        }
        this.ctx.effect(async () => {
            if (this.customDefaultContext) logger.warn('Default context already set.');
            this.customDefaultContext = ctx;
            return () => {
                this.customDefaultContext = null;
            };
        });
    }

    public withHandlerClass<T extends string>(
        name: T, callback: (HandlerClass: T extends `${string}ConnectionHandler` ? typeof ConnectionHandler<C> : typeof Handler<C>) => any,
    ) {
        name = name.replace(/Handler$/, '') as any;
        if (this.registry[name]) callback(this.registry[name]);
        // FIXME: should pass type check
        this.ctx.on(`handler/register/${name}`, callback as any);
    }

    // eslint-disable-next-line ts/naming-convention
    public Route(name: string, path: string, RouteHandler: typeof Handler<C>, ...permPrivChecker) {
        // if (name === 'contest_scoreboard') {
        //     console.log('+++', this.ctx);
        //     console.log(this.ctx.scoreboard);
        // }
        return this.register('route', name, path, RouteHandler, ...permPrivChecker);
    }

    // eslint-disable-next-line ts/naming-convention
    public Connection(name: string, path: string, RouteHandler: typeof ConnectionHandler<C>, ...permPrivChecker) {
        return this.register('conn', name, path, RouteHandler, ...permPrivChecker);
    }

    private registerLayer(name: 'serverLayers' | 'handlerLayers' | 'wsLayers', layer: any) {
        this.ctx.effect(() => {
            this[name].push(layer);
            return () => {
                this[name] = this[name].filter((i) => i !== layer);
            };
        });
    }

    public addServerLayer(name: string, func: any) {
        return this.registerLayer('serverLayers', { name, func });
    }

    public addHandlerLayer(name: string, func: any) {
        return this.registerLayer('handlerLayers', { name, func });
    }

    public addWSLayer(name: string, func: any) {
        return this.registerLayer('wsLayers', { name, func });
    }

    public addLayer(name: string, layer: any) {
        this.addHandlerLayer(name, layer);
        this.addWSLayer(name, layer);
    }

    public addCaptureRoute(prefix: string, cb: any) {
        this.captureAllRoutes[prefix] = cb;
    }

    private _applyMixin(Target: any, MixinClass: Partial<any> | ((t: Partial<any>) => Partial<any>)) {
        if (!('prototype' in Target)) throw new Error('Target must be a class.');
        if (typeof MixinClass === 'function') MixinClass = MixinClass(Target.prototype);
        this.ctx.effect(() => {
            let oldValue = null;
            for (const val of Object.getOwnPropertyNames(MixinClass)) {
                if (Target.prototype[val]) {
                    logger.warn(`${Target.name}.prototype[${val}] already exists.`);
                    oldValue = Target.prototype[val];
                }
                Target.prototype[val] = MixinClass[val];
            }
            return () => {
                for (const val of Object.getOwnPropertyNames(MixinClass)) {
                    if (Target.prototype[val] !== MixinClass[val]) {
                        logger.warn(`Failed to unload mixin ${Target.name}.prototype[${val}]: not the same as the original value.`);
                    } else {
                        delete Target.prototype[val];
                        if (oldValue) Target.prototype[val] = oldValue;
                    }
                }
            };
        });
    }

    public applyMixin<T extends keyof KnownHandlers>(name: T, MixinClass: any) {
        this.withHandlerClass(name, (HandlerClass) => {
            this._applyMixin(HandlerClass, MixinClass);
        });
    }

    public handlerMixin(MixinClass: Partial<HandlerCommon<C>> | ((s: HandlerCommon<C>) => Partial<HandlerCommon<C>>)) {
        return this._applyMixin(HandlerCommon, MixinClass);
    }

    public httpHandlerMixin(MixinClass: Partial<Handler<C>> | ((s: Handler<C>) => Partial<Handler<C>>)) {
        return this._applyMixin(Handler, MixinClass);
    }

    public wsHandlerMixin(MixinClass: Partial<ConnectionHandler<C>> | ((s: ConnectionHandler<C>) => Partial<ConnectionHandler<C>>)) {
        return this._applyMixin(ConnectionHandler, MixinClass);
    }

    public registerRenderer(name: string, func: Renderer) {
        if (this.renderers[name]) logger.warn('Renderer %s already exists.', name);
        this.ctx.effect(() => {
            this.renderers[name] = func;
            return () => {
                delete this.renderers[name];
            };
        });
    }
}

declare module 'cordis' {
    interface Context {
        server: WebService<this>;
        Route: WebService<this>['Route'];
        Connection: WebService<this>['Connection'];
        withHandlerClass: WebService<this>['withHandlerClass'];
    }
}
