import os from 'os';
import path from 'path';
import http from 'http';
import fs from 'fs-extra';
import Koa, { Context } from 'koa';
import Body from 'koa-body';
import cache from 'koa-static-cache';
import nunjucks from 'nunjucks';
import mongodb from 'mongodb';
import { argv } from 'yargs';

const listenPort = argv.port || 8888;

class Loader {
    getSource(name: string) { // eslint-disable-line class-methods-use-this
        return {
            src: `
            <!DOCTYPE html>
            <html data-page="setup" data-layout="immersive" class="layout--immersive page--setup nojs">
            <head>
              <meta charset="UTF-8">
              <meta http-equiv="Content-Type" content="text/html; charset=UTF-8"/>
              <meta http-equiv="X-UA-Compatible" content="chrome=1"/>
              <meta name="viewport" content="width=device-width, initial-scale=1, maximum-scale=1" />
              <meta name="msapplication-TileColor" content="#579e9a">
              <meta name="theme-color" content="#56758f">
              <link rel="stylesheet" media="all" href="/vj4.css">
              <title>{{ _('Setup') }}</title>
            </head>
            <body>
            <div class="slideout-panel" id="panel">
              <div class="main">
                <div class="row"><div class="columns">
                <div class="immersive--content immersive--center">
                  <h1>{{ _('Setup') }}</h1>
                  <form method="POST">
                    <div class="row"><div class="columns">
                      <label class="inverse material textbox">
                        {{ _('Database Host') }}
                        <input name="host" type="text" value="127.0.0.1" autofocus>
                      </label>
                    </div></div>
                    <div class="row"><div class="columns">
                      <label class="inverse material textbox">
                        {{ _('Database Port') }}
                        <input name="port" type="number" value="27017">
                      </label>
                    </div></div>
                    <div class="row"><div class="columns">
                      <label class="inverse material textbox">
                        {{ _('Database Name') }}
                        <input name="name" type="text" value="hydro">
                      </label>
                    </div></div>
                    <div class="row"><div class="columns">
                      <label class="inverse material textbox">
                        {{ _('Table Prefix') }}
                        <input name="prefix" type="text" placeholder="{{ _('Leave blank if none') }}">>
                      </label>
                    </div></div>
                    <div class="row"><div class="columns">
                      <label class="inverse material textbox">
                        {{ _('Database Username') }}
                        <input name="username" type="text" placeholder="{{ _('Leave blank if none') }}">
                      </label>
                    </div></div>
                    <div class="row"><div class="columns">
                      <label class="inverse material textbox">
                        {{ _('Database Password') }}
                        <input name="password" type="password" placeholder="{{ _('Leave blank if none') }}">
                      </label>
                    </div></div>
                    <div class="row"><div class="columns">
                      <div class="text-center">
                        <input type="submit" value="{{ _('Confirm') }}" class="inverse expanded rounded primary button">
                      </div>
                    </div></div>
                  </form>
                </div>
                </div></div>
              </div>
            </div>
            </body>
            </html>
            `,
            path: name,
            noCache: false,
        };
    }
}

const env = new nunjucks.Environment(new Loader(), { autoescape: true, trimBlocks: true });

function render(name: string) {
    return new Promise((resolve, reject) => {
        env.render(name, {
            _: (str: string) => str,
        }, (err, res) => {
            if (err) reject(err);
            else resolve(res);
        });
    });
}

async function get(ctx: Context) {
    ctx.body = await render('setup.html');
    ctx.response.type = 'text/html';
}

async function post(ctx: Context) {
    const {
        host, port, name, username, password, prefix,
    } = ctx.request.body;
    let mongourl = 'mongodb://';
    if (username) mongourl += `${username}:${password}@`;
    mongourl += `${host}:${port}/${name}`;
    try {
        const Database = await mongodb.MongoClient.connect(mongourl, {
            useNewUrlParser: true, useUnifiedTopology: true,
        });
        const db = Database.db(name);
        const coll = prefix ? db.collection('system') : db.collection(`${prefix}.system`);
        await Promise.all([
            coll.updateOne(
                { _id: 'server.host' },
                { $set: { value: ctx.request.host } },
                { upsert: true },
            ),
            coll.updateOne(
                { _id: 'server.hostname' },
                { $set: { value: ctx.request.hostname } },
                { upsert: true },
            ),
            coll.updateOne(
                { _id: 'server.url' },
                { $set: { value: ctx.request.href } },
                { upsert: true },
            ),
            coll.updateOne(
                { _id: 'server.port' },
                { $set: { value: parseInt(listenPort as string, 10) } },
                { upsert: true },
            ),
        ]);
        fs.ensureDirSync(path.resolve(os.homedir(), '.hydro'));
        fs.writeFileSync(path.resolve(os.homedir(), '.hydro', 'config.json'), JSON.stringify({
            host, port, name, username, password,
        }));
        ctx.body = `<h1>This page will reload in 3 secs.</h1>
            <script>
            setTimeout(function (){
                window.location.href = '/';
            }, 3000);
            </script>`;
        setTimeout(() => process.exit(0), 500);
    } catch (e) {
        ctx.body = `Error connecting to database: ${e.message}\n${e.stack}`;
    }
}

export function load() {
    const app = new Koa();
    const server = http.createServer(app.callback());
    app.keys = ['Hydro'];
    app
        .use(cache(path.join(os.tmpdir(), 'hydro', 'public'), {
            maxAge: 365 * 24 * 60 * 60,
        }))
        .use(Body())
        .use((ctx) => {
            if (ctx.request.method.toLowerCase() === 'post') return post(ctx);
            return get(ctx);
        });
    server.listen(listenPort);
    console.log('Server listening at:', listenPort);
}
