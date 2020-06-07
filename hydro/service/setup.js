const fs = require('fs');
const os = require('os');
const path = require('path');
const http = require('http');
const Koa = require('koa');
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

const env = new nunjucks.Environment(new Loader(), { autoescape: true, trimBlocks: true });

function render(name) {
    return new Promise((resolve, reject) => {
        env.render(name, {
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
    app.use(cache(path.join(os.tmpdir(), 'hydro', 'builtin'), {
        maxAge: 365 * 24 * 60 * 60,
    }));
    app.use(Body());
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
                await Promise.all([
                    db.collection('system').updateOne(
                        { _id: 'server.host' },
                        { $set: { value: ctx.request.host } },
                        { upsert: true },
                    ),
                    db.collection('system').updateOne(
                        { _id: 'server.hostname' },
                        { $set: { value: ctx.request.hostname } },
                        { upsert: true },
                    ),
                    db.collection('system').updateOne(
                        { _id: 'server.url' },
                        { $set: { value: ctx.request.href } },
                        { upsert: true },
                    ),
                ]);
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
