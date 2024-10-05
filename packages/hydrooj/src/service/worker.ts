import moment from 'moment-timezone';
import { sleep } from '@hydrooj/utils';
import { Context, Service } from '../context';
import db from './db';

declare module '../context' {
    interface Context {
        worker: WorkerService;
    }
}

export class WorkerService extends Service {
    private handlers: Record<string, Function> = {};
    consuming = true;
    running = null;
    promise: Promise<any> = null;
    coll = db.collection('schedule');

    constructor(ctx: Context) {
        super(ctx, 'worker', true);
        this.consume();
    }

    async getFirst() {
        if (process.env.CI) return null;
        const q = {
            executeAfter: { $lt: new Date() },
            type: 'schedule',
            subType: { $in: Object.keys(this.handlers) },
        };
        const res = await this.coll.findOneAndDelete(q);
        if (res.value) {
            this.ctx.logger.debug('%o', res.value);
            if (res.value.interval) {
                const executeAfter = moment(res.value.executeAfter).add(...res.value.interval).toDate();
                await this.coll.insertOne({ ...res.value, executeAfter });
            }
            return res.value;
        }
        return null;
    }

    async consume() {
        while (this.consuming) {
            try {
                // eslint-disable-next-line no-await-in-loop
                const doc = await this.getFirst();
                if (!doc) {
                    // eslint-disable-next-line no-await-in-loop
                    await sleep(1000);
                    continue;
                }
                this.running = doc;
                this.ctx.logger.debug('Worker task: %o', doc);
                const start = Date.now();
                this.promise = Promise.race([
                    this.handlers[doc.subType](doc).catch((e) => {
                        this.ctx.logger.error('Worker task fail: ', e);
                        this.ctx.logger.error('%o', doc);
                    }),
                    sleep(1200000),
                ]);
                // eslint-disable-next-line no-await-in-loop
                await this.promise;
                const spent = Date.now() - start;
                if (spent > 500) this.ctx.logger.warn('Slow worker task (%d ms): %o', spent, doc);
                this.running = null;
            } catch (err) {
                this.ctx.logger.error(err);
            }
        }
    }

    public addHandler(type: string, handler: Function) {
        this.ctx.effect(() => {
            this.handlers[type] = handler;
            return () => {
                delete this.handlers[type];
            };
        });
    }

    public async stop() {
        this.consuming = false;
        await this.promise;
    }
}

export async function apply(ctx: Context) {
    ctx.provide('worker', undefined, true);
    ctx.worker = new WorkerService(ctx);
}
