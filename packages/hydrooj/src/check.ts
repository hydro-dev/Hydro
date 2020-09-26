// TODO check more

import os from 'os';
import { Dictionary } from 'lodash';
import * as system from './model/system';
import * as db from './service/db';

const c = {};

type CheckItem = (context: any, log: Function, warn: Function, error: Function) => Promise<void>;

const checks: Dictionary<CheckItem> = {
    async checkDb(ctx, log, warn, error) {
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
    },
    async checkPerm(ctx, log, warn) {
        const { username } = os.userInfo();
        if (username === 'root') warn('Hydro should not be run as root.');
        // TODO check cwd read-write
    },
    async checkSystem(ctx, log, warn) {
        const platform = os.platform();
        if (platform !== 'linux') {
            warn(`Hydro is running on ${platform}, suggest to use linux4.4+.`);
        }
    },
    async checkMail(ctx, log, warn) {
        const from = system.get('smtp.from');
        if (!from) warn('SMTP account was not provided, email verification disabled.');
    },
    async checkIpHeader(ctx, log, warn) {
        const header = system.get('server.xff');
        if (header && !ctx.request.ip) warn('IP header seems incorrect.\nCheck dashboard>settings>server.');
    },
};

export async function start(ctx, log, warn, error, cb: (id: string) => void) {
    const id = String.random(6);
    cb(id);
    for (const name in checks) {
        if (c[id]) {
            delete c[id];
            return;
        }
        // eslint-disable-next-line no-await-in-loop
        await checks[name](ctx, log, warn, error);
    }
}

export async function cancel(id: string) {
    c[id] = true;
}
