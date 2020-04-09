const
    Koa = require('koa'),
    morgan = require('koa-morgan'),
    Body = require('koa-body'),
    Router = require('koa-router'),
    sockjs = require('sockjs');

const options = require('../options');

let http = options.listen.https ? require('https') : require('http');
let app = new Koa();
let server = http.createServer(app.callback());
app.keys = options.session.keys;
app.use(Body({
    multipart: true,
    formidable: {
        maxFileSize: 256 * 1024 * 1024
    }
}));
let router = new Router();
let m = [];
/**
 * @param {import('koa').Middleware} middleware 
 * @param {boolean} installForSocket
 */
function MIDDLEWARE(middleware, installForSocket = false) {
    app.use(middleware);
    if (installForSocket) m.push(middleware);
}
/**
 * @param {string} route 
 * @param {...import('koa').Middleware} handler 
 */
function GET(route, ...handler) {
    router.get(route, ...handler);
}
/**
 * @param {string} route 
 * @param {...import('koa').Middleware} handler 
 */
function POST(route, ...handler) {
    router.post(route, ...handler);
}

/**
 * @callback SockJSHandler
 * @param {import('sockjs').Connection} conn
 */
/**
 * @param {string} prefix
 * @param {SockJSHandler} handler
 */
function SOCKET(prefix, middlewares, handler) {
    const sock = sockjs.createServer({ prefix });
    sock.on('connection', async conn => {
        try {
            conn.cookies = {
                get(name) {
                    return conn.cookies[name];
                },
                set() { }
            };
            conn.state = {};
            conn.params = {};
            conn.request = {
                headers: conn.headers
            };
            let p = (conn.url.split('?')[1] || '').split('&');
            for (let i in p) p[i] = p[i].split('=');
            for (let i in p) conn.params[p[i][0]] = decodeURIComponent(p[i][1]);
            await new Promise((resolve, reject) => {
                conn.once('data', msg => {
                    for (let i of msg.split(';')) {
                        i = i.trim().split('=');
                        conn.cookies[i[0]] = i[1];
                    }
                    resolve();
                });
                setTimeout(reject, 5000);
            });
            for (let i of m)
                await new Promise((resolve, reject) => {
                    i(conn, resolve).catch(reject);
                });
            for (let i of middlewares)
                await new Promise((resolve, reject) => {
                    i(conn, resolve).catch(reject);
                });
            conn.send = data => {
                conn.write(JSON.stringify(data));
            };
            handler(conn);
        } catch (e) {
            console.error(e);
        }
    });
    sock.installHandlers(server);
}

exports.MIDDLEWARE = MIDDLEWARE;
exports.GET = GET;
exports.POST = POST;
exports.SOCKET = SOCKET;
exports.start = function start() {
    app.use(morgan(':method :url :status :res[content-length] - :response-time ms'));
    app.use(router.routes()).use(router.allowedMethods());
    server.listen(options.listen.port);
    console.log('Server listening at: %s', options.listen.port);
};
