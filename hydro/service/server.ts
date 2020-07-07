import assert from 'assert';
import path from 'path';
import os from 'os';
import http from 'http';
import _ from 'lodash';
import { ObjectID } from 'mongodb';
import Koa from 'koa';
import yaml from 'js-yaml';
import morgan from 'koa-morgan';
import Body from 'koa-body';
import Router from 'koa-router';
import cache from 'koa-static-cache';
import sockjs from 'sockjs';

import { render } from '../lib/template';
import * as validator from '../lib/validator';
import * as misc from '../lib/misc';
import * as user from '../model/user';
import * as system from '../model/system';
import * as blacklist from '../model/blacklist';
import * as token from '../model/token';
import * as opcount from '../model/opcount';

const {
    UserNotFoundError, BlacklistedError, PermissionError,
    UserFacingError, ValidationError, PrivilegeError,
    CsrfTokenError, InvalidOperationError, MethodNotAllowedError,
} = require('../error');

let enableLog = true;

const app = new Koa();
let server;
const router = new Router();

const _validateObjectId = (id: string | ObjectID, key: string) => {
    if (ObjectID.isValid(id)) return new ObjectID(id);
    throw new ValidationError(key);
};
const _bool = (val: any) => !!val;
const _splitAndTrim = (val: string) => {
    const t = val.split(',').map((i) => i.trim().split('+'));
    return _.flatten(t);
};
const _date = (val: string) => {
    const d = val.split('-');
    assert(d.length === 3);
    return `${d[0]}-${d[1].length === 1 ? '0' : ''}${d[1]}-${d[2].length === 1 ? '0' : ''}${d[2]}`;
};
const _time = (val: string) => {
    const t = val.split(':');
    assert(t.length === 2);
    return `${(t[0].length === 1 ? '0' : '') + t[0]}:${t[1].length === 1 ? '0' : ''}${t[1]}`;
};

const validate = {
    tid: _validateObjectId,
    rid: _validateObjectId,
    did: _validateObjectId,
    drid: _validateObjectId,
    drrid: _validateObjectId,
    psid: _validateObjectId,
    psrid: _validateObjectId,
    docId: _validateObjectId,
    mongoId: _validateObjectId,
    hidden: _bool,
    rated: _bool,
    category: _splitAndTrim,
    tag: _splitAndTrim,
    beginAtDate: _date,
    beginAtTime: _time,
    pid: (pid: string) => (Number.isSafeInteger(parseInt(pid, 10)) ? parseInt(pid, 10) : pid),
    content: validator.checkContent,
    title: validator.checkTitle,
    uid: (uid: string) => parseInt(validator.checkUid(uid), 10),
    password: validator.checkPassword,
    mail: validator.checkEmail,
    uname: validator.checkUname,
    page: (_page: string) => {
        let page: number;
        if (Number.isSafeInteger(parseInt(_page, 10))) page = parseInt(_page, 10);
        if (page <= 0) throw new ValidationError('page');
        return page;
    },
    duration: (_duration: string) => {
        let duration: number;
        if (!Number.isNaN(parseFloat(_duration))) duration = parseFloat(_duration);
        if (duration <= 0) throw new ValidationError('duration');
        return duration;
    },
    pids: (pids: string) => {
        const src = pids.split(',').map((i) => i.trim());
        const d: number[] = [];
        for (const i in src) {
            if (Number.isSafeInteger(parseInt(src[i], 10))) d[i] = parseInt(src[i], 10);
        }
        return d;
    },
    role: validator.checkRole,
    penaltyRules: (penaltyRules) => {
        try {
            penaltyRules = yaml.safeLoad(penaltyRules);
        } catch (e) {
            throw new ValidationError('penalty_rules', 'parse error');
        }
        assert(typeof penaltyRules === 'object', new ValidationError('penalty_rules', 'invalid format'));
        return penaltyRules;
    },
    yaml: (input) => {
        yaml.safeLoad(input);
        return input;
    },
};

async function prepare() {
    server = http.createServer(app.callback());
    app.keys = await system.get('session.keys');
    app.use(cache(path.join(os.tmpdir(), 'hydro', 'public'), {
        maxAge: 365 * 24 * 60 * 60,
    }));
    app.use(Body({
        multipart: true,
        formidable: {
            maxFileSize: 256 * 1024 * 1024,
        },
    }));
}

const HandlerMixin = (Class) => class extends Class {
    async renderHTML(name: string, context: any): Promise<string> {
        if (enableLog) console.time(name);
        this.hasPerm = (perm) => this.user.hasPerm(perm);
        // FIXME fix this ugly hack
        this._user = { ...this.user, gravatar: misc.gravatar(this.user.gravatar, 128) };
        const res = await render(name, Object.assign(context, {
            handler: this,
            // @ts-ignore
            url: (...args) => this.url(...args),
            _: (str: string) => (str ? str.toString().translate(this.user.viewLang || this.session.viewLang) : ''),
            user: this.user,
        }));
        if (enableLog) console.timeEnd(name);
        return res;
    }

    async limitRate(op, periodSecs, maxOperations) {
        await opcount.inc(op, this.request.ip, periodSecs, maxOperations);
    }

    translate(str) {
        return str ? str.toString().translate(this.user.viewLang || this.session.viewLang) : '';
    }

    renderTitle(str) {
        return `${this.translate(str)} - Hydro`;
    }

    checkPerm(...args) {
        for (const i in args) {
            if (args[i] instanceof Array) {
                let p = false;
                for (const j in args) {
                    if (this.user.hasPerm(args[i][j])) {
                        p = true;
                        break;
                    }
                }
                if (!p) throw new PermissionError([args[i]]);
            } else if (!this.user.hasPerm(args[i])) {
                throw new PermissionError([[args[i]]]);
            }
        }
    }

    checkPriv(...args) {
        for (const i in args) {
            if (args[i] instanceof Array) {
                let p = false;
                for (const j in args) {
                    if (this.user.hasPriv(args[i][j])) {
                        p = true;
                        break;
                    }
                }
                if (!p) throw new PrivilegeError([args[i]]);
            } else if (!this.user.hasPriv(args[i])) {
                throw new PrivilegeError([[args[i]]]);
            }
        }
    }

    url(name, kwargs = {}) {
        let res = '#';
        const args: any = { ...kwargs };
        try {
            if (this.args.domainId !== 'system') {
                name += '_with_domainId';
                args.domainId = args.domainId || this.args.domainId;
            }
            const { anchor, query } = args;
            if (query) res = router.url(name, args, { query });
            else res = router.url(name, args);
            if (anchor) return `${res}#${anchor}`;
        } catch (e) {
            console.error(e.message);
            console.log(name, args);
        }
        return res;
    }
};

export const Handler = HandlerMixin(class {
    UIContext: any;

    args: any;

    ctx: Koa.Context;

    request: {
        host: string,
        hostname: string,
        ip: string,
        headers: any,
        cookies: any,
        body: any,
        files: any,
        query: any,
        path: string,
        params: any,
        referer: any,
        json: boolean,
    };

    response: {
        body: any,
        type: string,
        status: number,
        template: string | undefined,
        redirect: string | undefined,
        disposition: string | undefined,
        attachment: (name: string) => void,
    };

    session: any;

    csrfToken: string;

    user: any;

    constructor(ctx: Koa.Context, args: any) {
        this.ctx = ctx;
        this.args = args;
        this.request = {
            host: ctx.request.host,
            hostname: ctx.request.hostname,
            ip: ctx.request.ip,
            headers: ctx.request.headers,
            cookies: ctx.cookies,
            body: ctx.request.body,
            files: ctx.request.files,
            query: ctx.query,
            path: ctx.path,
            params: ctx.params,
            referer: ctx.request.headers.referer || '/',
            json: (ctx.request.headers.accept || '').includes('application/json'),
        };
        this.response = {
            body: {},
            type: '',
            status: null,
            template: null,
            redirect: null,
            attachment: (name) => ctx.attachment(name),
            disposition: null,
        };
        this.UIContext = {
            cdn_prefix: '/',
            url_prefix: '/',
        };
        this.session = {};
    }

    async render(name: string, context: any) {
        // @ts-ignore
        this.response.body = await this.renderHTML(name, context);
        this.response.type = 'text/html';
    }

    back(body: any) {
        this.response.body = body || this.response.body || {};
        this.response.redirect = this.request.headers.referer || '/';
    }

    binary(data: any, name: string) {
        this.response.body = data;
        this.response.template = null;
        this.response.type = 'application/octet-stream';
        this.response.disposition = `attachment; filename="${name}"`;
    }

    async getSession() {
        const sid = this.request.cookies.get('sid');
        this.session = await token.get(sid, token.TYPE_SESSION, false);
        if (!this.session) this.session = { uid: 0 };
    }

    async getBdoc() {
        const bdoc = await blacklist.get(this.request.ip);
        if (bdoc) throw new BlacklistedError(this.request.ip);
    }

    async getCsrfToken() {
        this.csrfToken = await token.createOrUpdate(token.TYPE_CSRF_TOKEN, 600, {
            path: this.request.path,
            uid: this.session.uid,
        });
        this.UIContext.csrfToken = this.csrfToken;
    }

    async init({ domainId }) {
        await Promise.all([
            this.getSession(),
            this.getBdoc(),
        ]);
        [this.user] = await Promise.all([
            user.getById(domainId, this.session.uid, true),
            this.getCsrfToken(),
        ]);
    }

    async checkCsrfToken(csrfToken: any) {
        const sdoc = await token.get(csrfToken, token.TYPE_CSRF_TOKEN, false);
        if (!sdoc || sdoc.uid !== this.user._id) throw new CsrfTokenError(csrfToken);
    }

    async finish() {
        try {
            await this.renderBody();
        } catch (error) {
            this.response.status = error instanceof UserFacingError ? error.code : 500;
            if (this.request.json) this.response.body = { error };
            else await this.render(error instanceof UserFacingError ? 'error.html' : 'bsod.html', { error });
        }
        await this.putResponse();
        await this.saveCookie();
    }

    async renderBody() {
        if (!this.response.redirect && !this.request.json) {
            if (this.response.body || this.response.template) {
                if (this.request.query.noTemplate || this.request.json) return;
                const templateName = this.request.query.template || this.response.template;
                if (templateName) {
                    this.response.body = this.response.body || {};
                    await this.render(templateName, this.response.body);
                }
            }
        }
    }

    async putResponse() {
        if (this.response.disposition) this.ctx.set('Content-Disposition', this.response.disposition);
        if (this.response.redirect && !this.request.json) {
            this.ctx.response.type = 'application/octet-stream';
            this.ctx.response.status = 302;
            this.ctx.redirect(this.response.redirect);
        } else {
            if (this.response.redirect) {
                this.response.body = this.response.body || {};
                this.response.body.url = this.response.redirect;
            }
            if (this.response.body != null) {
                this.ctx.response.body = this.response.body;
                this.ctx.response.status = this.response.status || 200;
            }
            this.ctx.response.type = this.request.json
                ? 'application/json'
                : this.response.type
                    ? this.response.type
                    : this.ctx.response.type;
        }
    }

    async saveCookie() {
        const expireSeconds = this.session.save
            ? await system.get('session.expire_seconds')
            : await system.get('session.unsaved_expire_seconds');
        if (this.session._id) {
            await token.update(
                this.session._id,
                token.TYPE_SESSION,
                expireSeconds,
                {
                    ...this.session,
                    updateIp: this.request.ip,
                    updateUa: this.request.headers['user-agent'] || '',
                },
            );
        } else {
            [, this.session] = await token.add(
                token.TYPE_SESSION,
                expireSeconds,
                {
                    ...this.session,
                    createIp: this.request.ip,
                    createUa: this.request.headers['user-agent'] || '',
                    updateIp: this.request.ip,
                    updateUa: this.request.headers['user-agent'] || '',
                },
            );
        }
        const cookie: any = { secure: await system.get('session.secure') };
        if (this.session.save) {
            cookie.expires = this.session.expireAt;
            cookie.maxAge = expireSeconds;
        }
        this.ctx.cookies.set('sid', this.session._id, cookie);
    }

    async onerror(error) {
        if (!error.msg) error.msg = () => error.message;
        console.error(error.msg(), error.params);
        console.error(error.stack);
        this.response.status = error instanceof UserFacingError ? error.code : 500;
        this.response.template = error instanceof UserFacingError ? 'error.html' : 'bsod.html';
        this.response.body = {
            error: { message: error.msg(), params: error.params, stack: error.stack },
        };
        await this.finish().catch(() => { });
    }
});

async function handle(ctx, HandlerClass, checker) {
    global.Hydro.stat.reqCount++;
    const args = {
        domainId: 'system', ...ctx.params, ...ctx.query, ...ctx.request.body,
    };
    const h = new HandlerClass(ctx, args);
    try {
        const method = ctx.method.toLowerCase();
        let operation;
        if (method === 'post' && ctx.request.body.operation) {
            operation = `_${ctx.request.body.operation}`
                .replace(/_([a-z])/gm, (s) => s[1].toUpperCase());
        }

        await h.init(args);
        if (checker) checker.call(h);
        if (method === 'post') {
            await h.checkCsrfToken(args.csrfToken);
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

        let checking = '';
        try {
            for (const key in validate) {
                checking = key;
                if (args[key]) {
                    args[key] = validate[key](args[key], key);
                }
            }
        } catch (e) {
            if (e instanceof ValidationError) throw e;
            throw new ValidationError(`Argument ${checking} check failed`);
        }

        if (h._prepare) await h._prepare(args);
        if (h.prepare) await h.prepare(args);

        if (h[method]) await h[method](args);
        if (operation) await h[`post${operation}`](args);

        if (h.cleanup) await h.cleanup(args);
        if (h.finish) await h.finish(args);
    } catch (e) {
        await h.onerror(e);
    }
}

const Checker = (permPrivChecker) => {
    let perm;
    let priv;
    let checker = () => { };
    for (const item of permPrivChecker) {
        if (typeof item === 'object') {
            if (typeof item.call !== 'undefined') {
                checker = item;
            } if (typeof item[0] === 'number') {
                priv = item;
            } else if (typeof item[0] === 'string') {
                perm = item;
            }
        } else if (typeof item === 'number') {
            priv = item;
        } else if (typeof item === 'string') {
            perm = item;
        }
    }
    return function check() {
        checker();
        if (perm) this.checkPerm(perm);
        if (priv) this.checkPriv(priv);
    };
};

export function Route(name, route, RouteHandler, ...permPrivChecker) {
    const checker = Checker(permPrivChecker);
    router.all(name, route, (ctx) => handle(ctx, RouteHandler, checker));
    router.all(`${name}_with_domainId`, `/d/:domainId${route}`, (ctx) => handle(ctx, RouteHandler, checker));
}

export const ConnectionHandler = HandlerMixin(class {
    conn: sockjs.Connection;

    request: {
        params: any
        headers: any
        ip: string
    }

    session: any

    user: any

    constructor(conn: sockjs.Connection) {
        this.conn = conn;
        this.request = {
            params: {},
            headers: conn.headers,
            ip: this.conn.remoteAddress,
        };
        this.session = {};
        const p: any = (conn.url.split('?')[1] || '').split('&');
        for (const i in p) p[i] = p[i].split('=');
        for (const i in p) this.request.params[p[i][0]] = decodeURIComponent(p[i][1]);
    }

    send(data: JSON) {
        this.conn.write(JSON.stringify(data));
    }

    close(code: number, reason: string) {
        this.conn.close(code.toString(), reason);
    }

    onerror(err: Error) {
        console.error(err);
        this.close(1001, err.toString());
    }

    async init({ domainId }) {
        try {
            this.session = await token.get(this.request.params.token, token.TYPE_CSRF_TOKEN, true);
        } catch (e) {
            this.session = { uid: 0 };
        }
        const bdoc = await blacklist.get(this.request.ip);
        if (bdoc) throw new BlacklistedError(this.request.ip);
        this.user = await user.getById(domainId, this.session.uid);
        if (!this.user) throw new UserNotFoundError(this.session.uid);
    }
});

interface IConnectionHandler {
    // @ts-ignore
    new(conn: sockjs.Connection): ConnectionHandler;
}

export function Connection(
    name: string, prefix: string,
    RouteConnHandler: IConnectionHandler,
    ...permPrivChecker: Array<number | string | Function>
) {
    const sock = sockjs.createServer({ prefix });
    const checker = Checker(permPrivChecker);
    sock.on('connection', async (conn) => {
        const h = new RouteConnHandler(conn);
        try {
            const args = { domainId: 'system', ...h.request.params };
            h.args = args;
            await h.init(args);
            checker.call(h);
            let checking = '';
            try {
                for (const key in validate) {
                    checking = key;
                    if (args[key]) {
                        args[key] = validate[key](args[key], key);
                    }
                }
            } catch (e) {
                if (e instanceof ValidationError) throw e;
                throw new ValidationError(`Argument ${checking} check failed`);
            }
            if (h._prepare) await h._prepare(args);
            if (h.prepare) await h.prepare(args);
            if (h.message) {
                conn.on('data', (data) => {
                    h.message(JSON.parse(data));
                });
            }
            conn.on('close', async () => {
                if (h.cleanup) await h.cleanup(args);
                if (h.finish) await h.finish(args);
            });
        } catch (e) {
            console.log(e);
            await h.onerror(e);
        }
    });
    sock.installHandlers(server);
}

export function Middleware(middleware: Koa.Middleware) {
    app.use(middleware);
}

export function Validate(key: string, func: Function) {
    if (validate[key]) validate[key].push(func);
    else validate[key] = [func];
}

export async function start() {
    const [disableLog, port] = await system.getMany(['server.log', 'server.port']);
    if (!disableLog) {
        app.use(morgan(':method :url :status :res[content-length] - :response-time ms'));
    } else enableLog = false;
    app.use(router.routes()).use(router.allowedMethods());
    Route('notfound_handler', '*', Handler);
    server.listen(port);
    console.log('Server listening at: %s', port);
}

global.Hydro.service.server = {
    Handler, ConnectionHandler, Route, Connection, Middleware, Validate, prepare, start,
};

export default global.Hydro.service.server;
