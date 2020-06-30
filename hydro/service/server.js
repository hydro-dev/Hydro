const assert = require('assert');
const path = require('path');
const os = require('os');
const _ = require('lodash');
const { ObjectID } = require('bson');
const Koa = require('koa');
const yaml = require('js-yaml');
const morgan = require('koa-morgan');
const Body = require('koa-body');
const Router = require('koa-router');
const cache = require('koa-static-cache');
const sockjs = require('sockjs');
const http = require('http');
const validator = require('../lib/validator');
const template = require('../lib/template');
const misc = require('../lib/misc');
const user = require('../model/user');
const system = require('../model/system');
const blacklist = require('../model/blacklist');
const token = require('../model/token');
const opcount = require('../model/opcount');
const {
    UserNotFoundError, BlacklistedError, PermissionError,
    UserFacingError, ValidationError, PrivilegeError,
    CsrfTokenError, InvalidOperationError, MethodNotAllowedError,
} = require('../error');

let enableLog = true;

const app = new Koa();
let server;
const router = new Router();

const _validateObjectId = (id, key) => {
    if (ObjectID.isValid(id)) return new ObjectID(id);
    throw new ValidationError(key);
};
const _bool = (val) => !!val;
const _splitAndTrim = (val) => {
    const t = val.split(',').map((i) => i.trim().split('+'));
    return _.flatten(t);
};
const _date = (val) => {
    const d = val.split('-');
    assert(d.length === 3);
    return `${d[0]}-${d[1].length === 1 ? '0' : ''}${d[1]}-${d[2].length === 1 ? '0' : ''}${d[2]}`;
};
const _time = (val) => {
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
    pid: (pid) => (Number.isSafeInteger(parseInt(pid, 10)) ? parseInt(pid, 10) : pid),
    content: validator.checkContent,
    title: validator.checkTitle,
    uid: (uid) => parseInt(validator.checkUid(uid), 10),
    password: validator.checkPassword,
    mail: validator.checkEmail,
    uname: validator.checkUname,
    page: (page) => {
        if (Number.isSafeInteger(parseInt(page, 10))) page = parseInt(page, 10);
        if (page <= 0) throw new ValidationError('page');
        return page;
    },
    duration: (duration) => {
        if (!Number.isNaN(parseFloat(duration))) duration = parseFloat(duration);
        if (duration <= 0) throw new ValidationError('duration');
        return duration;
    },
    pids: (pids) => {
        const res = pids.split(',').map((i) => i.trim());
        for (const i in res) {
            if (Number.isSafeInteger(parseInt(res[i], 10))) res[i] = parseInt(res[i], 10);
        }
        return res;
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

class Handler {
    /**
     * @param {import('koa').Context} ctx
     */
    constructor(ctx) {
        this.ctx = ctx;
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
        };
        this.response = {
            body: '',
            type: '',
            status: null,
            template: null,
            redirect: null,
            attachment: (name) => ctx.attachment(name),
        };
        this.UIContext = {
            cdn_prefix: '/',
            url_prefix: '/',
        };
        this._handler = {};
        this.session = {};
    }

    async renderHTML(name, context) {
        if (enableLog) console.time(name);
        this.hasPerm = (perm) => this.user.hasPerm(perm);
        // FIXME fix this ugly hack
        this._user = { ...this.user, gravatar: misc.gravatar(this.user.gravatar, 128) };
        const res = await template.render(name, Object.assign(context, {
            handler: this,
            url: (...args) => this.url(...args),
            _: (str) => (str ? str.toString().translate(this.user.viewLang || this.session.viewLang) : ''),
            user: this.user,
        }));
        if (enableLog) console.timeEnd(name);
        return res;
    }

    async render(name, context) {
        this.response.body = await this.renderHTML(name, context);
        this.response.type = 'text/html';
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

    async limitRate(op, periodSecs, maxOperations) {
        await opcount.inc(op, this.request.ip, periodSecs, maxOperations);
    }

    back(body) {
        this.response.body = body || this.response.body || {};
        this.response.redirect = this.request.headers.referer || '/';
    }

    translate(str) {
        return str ? str.toString().translate(this.user.viewLang || this.session.viewLang) : '';
    }

    binary(data, name) {
        this.response.body = data;
        this.response.template = null;
        this.response.type = 'application/octet-stream';
        this.response.disposition = `attachment; filename="${name}"`;
    }

    url(name, kwargs = {}) {
        let res = '#';
        const args = { ...kwargs };
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

    async ___prepare({ domainId }) {
        this.response.body = {};
        this.now = new Date();
        this._handler.sid = this.request.cookies.get('sid');
        this._handler.save = this.request.cookies.get('save');
        if (this._handler.save) this._handler.expireSeconds = await system.get('session.saved_expire_seconds');
        else this._handler.expireSeconds = await system.get('session.unsaved_expire_seconds');
        this.session = this._handler.sid
            ? await token.update(
                this._handler.sid,
                token.TYPE_SESSION,
                this._handler.expireSeconds,
                {
                    updateIp: this.request.ip,
                    updateUa: this.request.headers['user-agent'] || '',
                },
            ) : { uid: 1 };
        if (!this.session) this.session = { uid: 0 };
        const bdoc = await blacklist.get(this.request.ip);
        if (bdoc) throw new BlacklistedError(this.request.ip);
        this.user = await user.getById(domainId, this.session.uid);
        if (!this.user) throw new UserNotFoundError(this.session.uid);
        this.csrfToken = await token.createOrUpdate(token.TYPE_CSRF_TOKEN, 600, {
            path: this.request.path,
            uid: this.session.uid,
        });
        this.UIContext.csrfToken = this.csrfToken;
        this.preferJson = (this.request.headers.accept || '').includes('application/json');
    }

    async checkCsrfToken(csrfToken) {
        const sdoc = await token.get(csrfToken, token.TYPE_CSRF_TOKEN);
        if (!sdoc || sdoc.uid !== this.user._id) throw new CsrfTokenError(csrfToken);
    }

    async ___cleanup() {
        try {
            await this.renderBody();
        } catch (error) {
            this.response.status = error instanceof UserFacingError ? error.code : 500;
            if (this.preferJson) this.response.body = { error };
            else await this.render(error instanceof UserFacingError ? 'error.html' : 'bsod.html', { error });
        }
        await this.putResponse();
        await this.saveCookie();
    }

    async renderBody() {
        if (!this.response.redirect && !this.preferJson) {
            if (this.response.body || this.response.template) {
                if (this.request.query.noTemplate || this.preferJson) return;
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
        if (this.response.redirect && !this.preferJson) {
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
            this.ctx.response.type = this.preferJson
                ? 'application/json'
                : this.response.type
                    ? this.response.type
                    : this.ctx.response.type;
        }
    }

    async saveCookie() {
        if (this.session._id) {
            await token.update(
                this.session._id,
                token.TYPE_SESSION,
                this._handler.expireSeconds,
                this.session,
            );
        } else {
            [this.session._id] = await token.add(
                token.TYPE_SESSION,
                this._handler.expireSeconds,
                {
                    createIp: this.request.ip,
                    createUa: this.request.headers['user-agent'] || '',
                    updateIp: this.request.ip,
                    updateUa: this.request.headers['user-agent'] || '',
                    ...this.session,
                },
            );
        }
        const cookie = { secure: await system.get('session.secure') };
        if (this._handler.save) {
            cookie.expires = this.session.expireAt;
            cookie.maxAge = this._handler.expireSeconds;
            this.ctx.cookies.set('save', 'true', cookie);
        }
        this.ctx.cookies.set('sid', this.session._id, cookie);
    }

    async onerror(error) {
        console.error(error.msg(), error.params);
        console.error(error.stack);
        this.response.status = error instanceof UserFacingError ? error.code : 500;
        this.response.template = error instanceof UserFacingError ? 'error.html' : 'bsod.html';
        this.response.body = {
            error: { message: error.msg(), params: error.params, stack: error.stack },
        };
        await this.___cleanup().catch(() => { });
    }
}

async function handle(ctx, HandlerClass, checker) {
    global.Hydro.stat.reqCount++;
    const h = new HandlerClass(ctx);
    try {
        const method = ctx.method.toLowerCase();
        const args = {
            domainId: 'system', ...ctx.params, ...ctx.query, ...ctx.request.body,
        };
        h.args = args;
        let operation;
        if (method === 'post' && ctx.request.body.operation) {
            operation = `_${ctx.request.body.operation}`
                .replace(/_([a-z])/gm, (s) => s[1].toUpperCase());
        }

        if (h.___prepare) await h.___prepare(args);
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

        if (h.__prepare) await h.__prepare(args);
        if (h._prepare) await h._prepare(args);
        if (h.prepare) await h.prepare(args);

        if (h[`___${method}`]) await h[`___${method}`](args);
        if (h[`__${method}`]) await h[`__${method}`](args);
        if (h[`_${method}`]) await h[`_${method}`](args);
        if (h[method]) await h[method](args);

        if (method === 'post' && ctx.request.body.operation) {
            const operation = `_${ctx.request.body.operation}`
                .replace(/_([a-z])/gm, (s) => s[1].toUpperCase());
            if (h[`${method}${operation}`]) await h[`${method}${operation}`](args);
        }

        if (h.cleanup) await h.cleanup(args);
        if (h._cleanup) await h._cleanup(args);
        if (h.__cleanup) await h.__cleanup(args);
        if (h.___cleanup) await h.___cleanup(args);
    } catch (e) {
        if (h.onerror) await h.onerror(e);
    }
}

const Checker = (perm, priv, checker) => function __() {
    checker();
    if (perm) this.checkPerm(perm);
    if (priv) this.checkPriv(priv);
};

function Route(name, route, RouteHandler, ...permPrivChecker) {
    let _priv;
    let _perm;
    let checker = () => { };
    for (const item of permPrivChecker) {
        if (typeof item === 'object') {
            if (typeof item.call !== 'undefined') {
                checker = item;
            } if (typeof item[0] === 'number') {
                _priv = item;
            } else if (typeof item[0] === 'string') {
                _perm = item;
            }
        } else if (typeof item === 'number') {
            _priv = item;
        } else if (typeof item === 'string') {
            _perm = item;
        }
    }
    checker = Checker(_perm, _priv, checker);
    router.all(name, route, (ctx) => handle(ctx, RouteHandler, checker));
    router.all(`${name}_with_domainId`, `/d/:domainId${route}`, (ctx) => handle(ctx, RouteHandler, checker));
}

class ConnectionHandler {
    /**
     * @param {import('sockjs').Connection} conn
     */
    constructor(conn) {
        this.conn = conn;
        this.request = {
            params: {},
            headers: conn.headers,
        };
        const p = (conn.url.split('?')[1] || '').split('&');
        for (const i in p) p[i] = p[i].split('=');
        for (const i in p) this.request.params[p[i][0]] = decodeURIComponent(p[i][1]);
    }

    url(name, kwargs = {}) {
        let res = '#';
        const args = { ...kwargs };
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
            console.error(name, kwargs);
        }
        return res;
    }

    async renderHTML(name, context) {
        this._user = { ...this.user, gravatar: misc.gravatar(this.user.gravatar, 128) };
        const res = await template.render(name, Object.assign(context, {
            handler: this,
            url: (...args) => this.url(...args),
            _: (str) => (str ? str.toString().translate(this.user.viewLang || this.session.viewLang) : ''),
            user: this.user,
        }));
        return res;
    }

    send(data) {
        this.conn.write(JSON.stringify(data));
    }

    close(code, reason) {
        this.conn.close(code, reason);
    }

    async ___prepare({ domainId }) {
        try {
            this.session = await token.get(this.request.params.token, token.TYPE_CSRF_TOKEN);
            await token.del(this.request.params.token, token.TYPE_CSRF_TOKEN);
        } catch (e) {
            this.session = { uid: 1 };
        }
        const bdoc = await blacklist.get(this.request.ip);
        if (bdoc) throw new BlacklistedError(this.request.ip);
        this.user = await user.getById(domainId, this.session.uid);
        if (!this.user) throw new UserNotFoundError(this.session.uid);
    }
}

function Connection(name, prefix, RouteConnHandler, permission) {
    const sock = sockjs.createServer({ prefix });
    sock.on('connection', async (conn) => {
        const h = new RouteConnHandler(conn);
        try {
            const args = { domainId: 'system', ...h.request.params };
            h.args = args;
            if (h.___prepare) await h.___prepare(args);
            if (permission) h.checkPerm(permission);
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
            if (h.__prepare) await h.__prepare(args);
            if (h._prepare) await h._prepare(args);
            if (h.prepare) await h.prepare(args);
            if (h.message) {
                conn.on('data', (data) => {
                    h.message(JSON.parse(data));
                });
            }
            conn.on('close', async () => {
                if (h.cleanup) await h.cleanup(args);
                if (h._cleanup) await h._cleanup(args);
                if (h.__cleanup) await h.__cleanup(args);
                if (h.___cleanup) await h.___cleanup(args);
            });
        } catch (e) {
            console.log(e);
            if (h.onerror) await h.onerror(e);
        }
    });
    sock.installHandlers(server);
}

function Middleware(middleware) {
    app.use(middleware);
}

function Validate(key, func) {
    if (validate[key]) validate[key].push(func);
    else validate[key] = [func];
}

async function start() {
    const [disableLog, port] = await system.getMany(['server.log', 'server.port']);
    if (!disableLog) {
        app.use(morgan(':method :url :status :res[content-length] - :response-time ms'));
    } else enableLog = false;
    app.use(router.routes()).use(router.allowedMethods());
    Route('notfound_handler', '*', Handler);
    server.listen(port);
    console.log('Server listening at: %s', port);
}

global.Hydro.service.server = module.exports = {
    Handler, ConnectionHandler, Route, Connection, Middleware, Validate, prepare, start,
};
