// TODO check more

import os from 'os';
import { DisposableList } from 'cordis';
import inspector from 'inspector';
import { randomstring } from '@hydrooj/utils';
import { Context, Service } from '../context';
import * as system from '../model/system';
import db from './db';
import storage from './storage';

type ReportFunction = (message: string, ...args: any[]) => Promise<void>;
type CheckItem = (context: any, log: ReportFunction, warn: ReportFunction, error: ReportFunction) => Promise<void>;

export default class CheckService extends Service {
    checkers = new DisposableList<CheckItem>();
    c = {};

    constructor(ctx: Context) {
        super(ctx, 'check');
        this.addChecker('Db', async (c, log, warn, error) => {
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
        this.addChecker('Storage', async (c, log, warn, error) => {
            const status = await storage.status();
            if (!status.status) error(`Connect to ${status.type} Storage ${status.bucket} Error: ${status.error}`);
        });
        this.addChecker('System', async (c, log, warn) => {
            const platform = os.platform();
            if (platform !== 'linux') {
                warn(`Hydro is running on ${platform}, suggest to use linux4.4+.`);
            }
        });
        this.addChecker('Mail', async (c, log, warn) => {
            const from = system.get('smtp.from');
            if (!from) warn('SMTP account is not provided, email verification disabled.');
        });
        this.addChecker('Setting', async (c, log, warn) => {
            const url = system.get('server.url');
            if (url === '/') warn("server.url isn't set.");
            const header = system.get('server.xff');
            if (header && !c.request.ip) warn('IP header seems incorrect.\nCheck dashboard>settings>server.');
        });
        this.addChecker('Inspector', async (c, log, warn) => {
            const url = inspector.url();
            if (url) warn(`Inspector is enabled at ${url}.`);
        });
    }

    addChecker(type: string, checkFunc: CheckItem) {
        this.checkers.push(checkFunc);
    }

    async run(ctx, log, warn, error, cb: (id: string) => void) {
        const id = randomstring(6);
        cb(id);
        for (const check of this.checkers) {
            if (this.c[id]) {
                delete this.c[id];
                return;
            }
            // eslint-disable-next-line no-await-in-loop
            await check(ctx, log, warn, error);
        }
    }

    async cancel(id: string) {
        this.c[id] = true;
    }
}
