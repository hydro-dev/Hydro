const fs = require('fs');
const path = require('path');
const http = require('http');
const Koa = require('koa');
const morgan = require('koa-morgan');
const Body = require('koa-body');
const Router = require('koa-router');
const cache = require('koa-static-cache');
const nunjucks = require('nunjucks');
const mongodb = require('mongodb');

class Loader {
    getSource(name) { // eslint-disable-line class-methods-use-this
        if (!global.Hydro.template[name]) throw new Error(`Cannot get template ${name}`);
        return {
            src: global.Hydro.template[name],
            path: name,
        };
    }
}

class Nunjucks extends nunjucks.Environment {
    constructor() {
        super(new Loader(), { autoescape: true, trimBlocks: true });
        this.addFilter('json', (self) => JSON.stringify(self), false);
        this.addFilter('base64_encode', (s) => Buffer.from(s).toString('base64'));
    }
}
const env = new Nunjucks();
function render(name) {
    return new Promise((resolve, reject) => {
        env.render(name, {
            typeof: (o) => typeof o,
            static_url: (str) => `/${str}`,
            handler: { renderTitle: (str) => str },
            _: (str) => str,
        }, (err, res) => {
            if (err) reject(err);
            else resolve(res);
        });
    });
}
async function setup() {
    const app = new Koa();
    const server = http.createServer(app.callback());
    const router = new Router();
    app.keys = ['Hydro'];
    app.use(cache(path.join(process.cwd(), '.uibuild'), {
        maxAge: 365 * 24 * 60 * 60,
    }));
    app.use(Body({ formidable: { maxFileSize: 256 * 1024 * 1024 } }));
    router.get('/', async (ctx) => {
        ctx.body = await render('setup.html');
        ctx.response.type = 'text/html';
    });
    const p = new Promise((resolve) => {
        router.post('/', async (ctx) => {
            const {
                host, port, name, username, password,
            } = ctx.request.body;
            let mongourl = 'mongodb://';
            if (username) mongourl += `${username}:${password}@`;
            mongourl += `${host}:${port}/${name}`;
            try {
                const Database = await mongodb.MongoClient.connect(mongourl, {
                    useNewUrlParser: true, useUnifiedTopology: true,
                });
                const db = Database.db(name);
                // Check Write Access
                await db.collection('test').insertOne({ test: 'test' });
                fs.writeFileSync(path.resolve(process.cwd(), 'config.json'), JSON.stringify({
                    host, port, name, username, password,
                }));
                ctx.redirect('/');
                resolve();
            } catch (e) {
                ctx.body = `Error connecting to database: ${e.message}\n${e.stack}`;
            }
        });
    });
    app.use(morgan(':method :url :status :res[content-length] - :response-time ms'));
    app.use(router.routes()).use(router.allowedMethods());
    server.listen(8888);
    console.log('Server listening at: 8888');
    await p;
    await new Promise((resolve, reject) => {
        server.close((err) => {
            if (err) reject(err);
            else resolve();
        });
    });
}

module.exports = { setup };
