const
    path = require('path'),
    { ObjectID } = require('bson'),
    Koa = require('koa'),
    morgan = require('koa-morgan'),
    Body = require('koa-body'),
    Router = require('koa-router'),
    cache = require('koa-static-cache'),
    sockjs = require('sockjs'),
    validator = require('../lib/validator'),
    template = require('../lib/template'),
    user = require('../model/user'),
    blacklist = require('../model/blacklist'),
    token = require('../model/token'),
    opcount = require('../model/opcount'),
    { UserNotFoundError, BlacklistedError, PermissionError,
        NotFoundError } = require('../error');

const options = require('../options');
let http = options.listen.https ? require('https') : require('http');
let app = new Koa();
let server = http.createServer(app.callback());
app.keys = options.session.keys;
app.use(cache(path.join(process.cwd(), '.uibuild'), {
    maxAge: 365 * 24 * 60 * 60
}));
app.use(Body({
    multipart: true,
    formidable: {
        maxFileSize: 256 * 1024 * 1024
    }
}));
let router = new Router();

class Handler {
    /**
     * @param {import('koa').Context} ctx 
     */
    constructor(ctx) {
        this.ctx = ctx;
        this.request = {
            ip: ctx.request.ip,
            headers: ctx.request.headers,
            cookies: ctx.cookies,
            body: ctx.request.body,
            files: ctx.request.files,
            query: ctx.query,
            path: ctx.path
        };
        this.response = {
            body: '',
            type: '',
            status: 404,
            template: null,
            redirect: null,
            attachment: name => ctx.attachment(name)
        };
        this.UIContext = {
            cdn_prefix: '/',
            url_prefix: '/'
        };
        this._handler = {};
    }
    renderHTML(name, context) {
        console.time(name);
        this.hasPerm = perm => this.user.hasPerm(perm);
        return new Promise((resolve, reject) => {
            template.render(name, Object.assign(context, {
                handler: this,
                _: str => str ? str.toString().translate(this.user.language) : '',
                user: this.user
            }), (error, res) => {
                console.timeEnd(name);
                if (error) reject(error);
                else resolve(res);
            });
        });
    }
    async render(name, context) {
        this.response.body = await this.renderHTML(name, context);
        this.response.type = 'text/html';
    }
    render_title(str) {
        return str;
    }
    checkPerm(perm) {
        for (let i in arguments) {
            if (arguments[i] instanceof Array) {
                let p = false;
                for (let j in arguments)
                    if (this.user.hasPerm(arguments[i][j])) {
                        p = true;
                        break;
                    }
                if (!p) throw new PermissionError([arguments[i]]);
            } else {
                if (this.user.hasPerm(arguments[i])) continue;
                else throw new PermissionError([[arguments[i]]]);
            }
        }
    }
    async limitRate(op, period_secs, max_operations) {
        await opcount.inc(op, this.request.ip, period_secs, max_operations);
    }
    back() {
        this.ctx.redirect(this.request.headers.referer || '/');
    }
    async ___prepare() {
        this._handler.sid = this.request.cookies.get('sid');
        this._handler.save = this.request.cookies.get('save');
        this._handler.tokenType = token.TYPE_SESSION;
        if (this._handler.save) this._handler.expireSeconds = options.session.saved_expire_seconds;
        else this._handler.expireSeconds = options.session.unsaved_expire_seconds;
        this.session = this._handler.sid ?
            await token.update(this._handler.sid, this._handler.tokenType, this._handler.expireSeconds, {
                update_ip: this.request.ip,
                update_ua: this.request.headers['user-agent'] || ''
            }) : { uid: 1 };
        if (!this.session) this.session = { uid: 1 };
        let bdoc = await blacklist.get(this.request.ip);
        if (bdoc) throw new BlacklistedError(this.request.ip);
        this.user = await user.getById(this.session.uid);
        console.log(this.user, this.session.uid);
        if (!this.user) throw new UserNotFoundError(this.session.uid);
        this.csrf_token = (await token.add(token.TYPE_CSRF_TOKEN, 600, this.request.path))[0];
        this.preferJson = (this.request.headers['accept'] || '').includes('application/json');
    }
    async ___cleanup() {
        try {
            await this.renderBody();
        } catch (e) {
            try {
                let error;
                if (this.response.body && this.response.body.error) error = this.response.body.error;
                else error = e;
                if (error instanceof NotFoundError) this.response.status = 404;
                if (error.name == 'Template render error') throw error;
                if (this.preferJson) this.response.body = { error };
                else await this.render('error.html', { error });
            } catch (error) {
                if (this.preferJson) this.response.body = { error };
                else await this.render('bsod.html', { error });
            }
        }
        await this.putResponse();
        await this.saveCookie();
    }
    async renderBody() {
        if (this.response.body || this.response.template) {
            if (this.request.query.noTemplate || this.preferJson) return;
            if (this.request.query.template || this.response.template) {
                this.response.body = this.response.body || {};
                await this.render(this.request.query.template || this.response.template, this.response.body);
            }
        }
    }
    async putResponse() {
        if (this.response.redirect) {
            this.response.type = 'application/octet-stream';
            this.redirect(this.response.redirect);
        }
        if (this.response.body) this.ctx.body = this.response.body;
        if (this.response.type) this.ctx.response.type = this.response.type;
        if (this.response.status) this.ctx.response.status = this.response.status;
    }
    async saveCookie() {
        if (this.session.sid)
            await token.update(this.session.sid, this._handler.tokenType, this._handler.expireSeconds, {
                updateIp: this.request.ip,
                updateUa: this.request.headers['user-agent'] || ''
            });
        else
            [this.session.sid] = await token.add(this._handler.tokenType, this._handler.expireSeconds, {
                createIp: this.request.ip,
                createUa: this.request.headers['user-agent'] || '',
                updateIp: this.request.ip,
                updateUa: this.request.headers['user-agent'] || '',
                ...this.session
            });
        let cookie = { secure: options.session.secure };
        if (this._handler.save) {
            cookie.expires = this.session.expireAt, cookie.maxAge = this._handler.expireSeconds;
            this.request.cookies.set('save', 'true', cookie);
        }
        this.ctx.cookies.set('sid', this.session.sid, cookie);
    }
    async onerror(e) {
        console.error(e.message, e.params);
        console.error(e.stack);
        await this.___cleanup();
    }
}
function Route(route, handler) {
    router.all(route, async (ctx) => {
        let h = new handler(ctx);
        try {
            let method = ctx.method.toLowerCase();
            let args = Object.assign({}, ctx.params, ctx.query, ctx.request.body);

            if (args.content) validator.checkContent(args.content);
            if (args.title) validator.checkContent(args.title);
            if (args.uid) args.uid = parseInt(validator.checkUid(args.uid));
            if (args.page) args.page = parseInt(args.page);
            if (args.rid) args.rid = new ObjectID(args.rid);
            if (args.tid) args.tid = new ObjectID(args.tid);

            if (h.___prepare) await h.___prepare(args);
            if (h.__prepare) await h.__prepare(args);
            if (h._prepare) await h._prepare(args);
            if (h.prepare) await h.prepare(args);

            if (h[`___${method}`]) await h[`___${method}`](args);
            if (h[`__${method}`]) await h[`__${method}`](args);
            if (h[`_${method}`]) await h[`_${method}`](args);
            if (h[method]) await h[method](args);

            console.log(ctx.request.body);
            if (method == 'post' && ctx.request.body.operation) {
                if (h[`${method}_${ctx.request.body.operation}`])
                    await h[`${method}_${ctx.request.body.operation}`](args);
            }

            if (h.cleanup) await h.cleanup(args);
            if (h._cleanup) await h._cleanup(args);
            if (h.__cleanup) await h.__cleanup(args);
            if (h.___cleanup) await h.___cleanup(args);
        } catch (e) {
            if (h.onerror) await h.onerror(e);
        }
    });
}

class ConnectionHandler {
    /**
     * @param {import('sockjs').Connection} conn 
     */
    constructor(conn) {
        this.conn = conn;
        this.request = {
            cookies: {
                get(name) {
                    return conn.cookies[name];
                },
                set() { }
            },
            params: {},
            headers: conn.headers
        };
        let p = (conn.url.split('?')[1] || '').split('&');
        for (let i in p) p[i] = p[i].split('=');
        for (let i in p) conn.params[p[i][0]] = decodeURIComponent(p[i][1]);
    }
    renderHTML(name, context) {
        console.time(name);
        this.hasPerm = perm => this.user.hasPerm(perm);
        return new Promise((resolve, reject) => {
            template.render(name, Object.assign(context, {
                handler: this,
                _: this.translate,
                user: this.user
            }), (error, res) => {
                console.timeEnd(name);
                if (error) reject(error);
                else resolve(res);
            });
        });
    }
    send(data) {
        this.conn.write(JSON.stringify(data));
    }
    close(code, reason) {
        this.conn.close(code, reason);
    }
    async ___prepare() {
        await new Promise((resolve, reject) => {
            this.conn.once('data', msg => {
                for (let i of msg.split(';')) {
                    i = i.trim().split('=');
                    this.request.cookies[i[0]] = i[1];
                }
                resolve();
            });
            setTimeout(reject, 5000);
        });
        this._handler.sid = this.request.cookies.get('sid');
        this.session = this._handler.sid ? await token.get(this._handler.sid, token.TYPE_SESSION) : { uid: 1 };
        if (!this.session) this.session = { uid: 1 };
        let bdoc = await blacklist.get(this.request.ip);
        if (bdoc) throw new BlacklistedError(this.request.ip);
        this.user = await user.getById(this.session.uid);
        if (!this.user) throw new UserNotFoundError(this.session.uid);
    }
}
function Connection(prefix, handler) {
    const sock = sockjs.createServer({ prefix });
    sock.on('connection', async conn => {
        let h = new handler(conn);
        try {
            let args = Object.assign({}, h.conn.params);

            if (args.uid) args.uid = parseInt(validator.checkUid(args.uid));
            if (args.page) args.page = parseInt(args.page);
            if (args.rid) args.rid = new ObjectID(args.rid);
            if (args.tid) args.tid = new ObjectID(args.tid);

            if (h.___prepare) await h.___prepare(args);
            if (h.__prepare) await h.__prepare(args);
            if (h._prepare) await h._prepare(args);
            if (h.prepare) await h.prepare(args);
            if (h.message) conn.on('data', data => {
                h.message(JSON.parse(data));
            });
            conn.on('close', async () => {
                if (h.cleanup) await h.cleanup(args);
                if (h._cleanup) await h._cleanup(args);
                if (h.__cleanup) await h.__cleanup(args);
                if (h.___cleanup) await h.___cleanup(args);
            });
        } catch (e) {
            if (h.onerror) await h.onerror(e);
        }
    });
    sock.installHandlers(server);
}

exports.Handler = Handler;
exports.ConnectionHandler = ConnectionHandler;
exports.Route = Route;
exports.Connection = Connection;
exports.start = function start() {
    app.use(morgan(':method :url :status :res[content-length] - :response-time ms'));
    app.use(router.routes()).use(router.allowedMethods());
    server.listen(options.listen.port);
    console.log('Server listening at: %s', options.listen.port);
};
