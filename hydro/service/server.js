const
    Koa = require('koa'),
    morgan = require('koa-morgan'),
    Body = require('koa-body'),
    Router = require('koa-router'),
    SockJS = require('sockjs');

const options = require('../options');

let http = options.listen.https ? require('https') : require('http');
let app = new Koa();
let server = http.createServer(app.callback());
app.keys = options.session.keys;
app.use(morgan(':method :url :status :res[content-length] - :response-time ms'));
app.use(Body({
    multipart: true,
    formidable: {
        maxFileSize: 256 * 1024 * 1024
    }
}));
let router = new Router();

/**
 * @param {import('koa').Middleware} middleware 
 */
function MIDDLEWARE(middleware) {
    app.use(middleware);
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
function SOCKET(prefix, handler) {
    const sock = SockJS.createServer({ prefix });
    sock.on('connection', handler);
    sock.installHandlers(server);
}
exports.MIDDLEWARE = MIDDLEWARE;
exports.GET = GET;
exports.POST = POST;
exports.SOCKET = SOCKET;
exports.start = function start() {
    app.use(router.routes()).use(router.allowedMethods());
    app.listen(options.listen.port);
    console.log('Server listening at: %s', options.listen.port);
};
