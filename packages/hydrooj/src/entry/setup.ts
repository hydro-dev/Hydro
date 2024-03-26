import http from 'http';
import os from 'os';
import path from 'path';
import cac from 'cac';
import fs from 'fs-extra';
import Koa, { Context } from 'koa';
import Body from 'koa-body';
import { MongoClient, WriteConcern } from 'mongodb';
import mongoUri from 'mongodb-uri';
import { Logger } from '../logger';

const logger = new Logger('setup');
const listenPort = cac().parse().options.port || 8888;
let resolve;

async function get(ctx: Context) {
    ctx.body = `<!DOCTYPE html>
    <html data-page="setup" data-layout="immersive" class="layout--immersive page--setup nojs">
    <head>
      <meta charset="UTF-8">
      <meta http-equiv="Content-Type" content="text/html; charset=UTF-8"/>
      <meta name="viewport" content="width=device-width, initial-scale=1, maximum-scale=1" />
      <link rel="stylesheet" media="all" href="/default.theme.css">
      <title>Setup</title>
    </head>
    <body>
    <div class="slideout-panel" id="panel">
      <div class="main">
        <div class="row"><div class="columns">
        <div class="immersive--content immersive--center">
          <h1>Setup</h1>
          <form method="POST">
            <div class="row"><div class="columns">
              <label class="inverse material textbox">
                MongoDB Connection URI
                <input name="url" type="text" value="mongodb://user:pass@127.0.0.1:27017/hydro" autofocus>
              </label>
            </div></div>
            <div class="row"><div class="columns">
              <div class="text-center">
                <input type="submit" value="Confirm" class="inverse expanded rounded primary button">
              </div>
            </div></div>
          </form>
        </div>
        </div></div>
      </div>
    </div>
    </body>
    </html>`;
    ctx.response.type = 'text/html';
}

async function post(ctx: Context) {
    try {
        const url = mongoUri.parse(ctx.request.body?.url);
        const Database = await MongoClient.connect((ctx.request as any).body, {
            readPreference: 'nearest',
            writeConcern: new WriteConcern('majority'),
        });
        const db = Database.db(url.database);
        const coll = db.collection<any>('system');
        await Promise.all([
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
        fs.writeFileSync(path.resolve(os.homedir(), '.hydro', 'config.json'), JSON.stringify({ url: ctx.request.body.url }));
        ctx.body = '<h1>Done! Hydro is now starting.</h1>';
        resolve?.();
    } catch (e) {
        ctx.body = `Error connecting to database: ${e.message}\n${e.stack}`;
    }
}

export function load() {
    const app = new Koa();
    const server = http.createServer(app.callback());
    app.keys = ['Hydro'];
    app
        .use(Body())
        .use((ctx) => {
            if (ctx.request.method.toLowerCase() === 'post') return post(ctx);
            return get(ctx);
        });
    server.listen(listenPort);
    logger.success('Server listening at: %d', listenPort);
    return new Promise((r) => {
        resolve = r;
    });
}
