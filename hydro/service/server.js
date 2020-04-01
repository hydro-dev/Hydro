const options = require('../options');
let http = options.listen.https ? require('https') : require('http');
let app = new (require('koa'))();
let server = http.createServer(app.callback());
app.keys = options.session.keys;
app.use(require('koa-morgan')(':method :url :status :res[content-length] - :response-time ms'));
app.use(require('koa-body')());
let router = (new require('koa-router'))();
const sockjs = require('sockjs');
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
    const sock = sockjs.createServer({ prefix });
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