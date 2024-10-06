// TODO check more

import os from 'os';
import { Dictionary } from 'lodash';
import { Context, Service } from '../context';
import * as system from '../model/system';
import db from './db';
import storage from './storage';

type CheckItem = (context: any, log: Function, warn: Function, error: Function) => Promise<void>;

export class CheckService extends Service {
    checkers: Dictionary<CheckItem> = {};
    c = {};
    addChecker(type: string, checkFunc: CheckItem) {
        this.ctx.effect(() => {
            this.checkers[`check${type}`] = checkFunc;
            return () => {
                delete this.checkers[`check${type}`];
            };
        });
    }

    async run(ctx, log, warn, error, cb: (id: string) => void) {
        const id = String.random(6);
        cb(id);
        for (const name in this.checkers) {
            if (this.c[id]) {
                delete this.c[id];
                return;
            }
            // eslint-disable-next-line no-await-in-loop
            await this.checkers[name](ctx, log, warn, error);
        }
    }

    async cancel(id: string) {
        this.c[id] = true;
    }
}

export const check = new CheckService(app, 'check', true);

check.addChecker('Db', async (ctx, log, warn, error) => {
    try {
        const coll = db.collection('check');
        const d = await coll.findOne({ _id: 'check' });
        if (!d) await coll.insertOne({ _id: 'check', value: 'check' });
        await coll.createIndex('check');
        await coll.deleteOne({ _id: 'check' });
        await coll.drop();
    } catch (e) {
        error(`Mongo Error: Database read-write failed.\n${e.message}`);
    }
});
check.addChecker('Storage', async (ctx, log, warn, error) => {
    const status = await storage.status();
    if (!status.status) error(`Connect to ${status.type} Storage ${status.bucket} Error: ${status.error}`);
});
check.addChecker('System', async (ctx, log, warn) => {
    const platform = os.platform();
    if (platform !== 'linux') {
        warn(`Hydro is running on ${platform}, suggest to use linux4.4+.`);
    }
});
check.addChecker('Mail', async (ctx, log, warn) => {
    const from = system.get('smtp.from');
    if (!from) warn('SMTP account is not provided, email verification disabled.');
});
check.addChecker('Setting', async (ctx, log, warn) => {
    const url = system.get('server.url');
    if (url === '/') warn("server.url isn't set.");
    const header = system.get('server.xff');
    if (header && !ctx.request.ip) warn('IP header seems incorrect.\nCheck dashboard>settings>server.');
});

export async function apply(ctx: Context) {
    ctx.provide('check', CheckService, true);
    ctx.check = check;
}
