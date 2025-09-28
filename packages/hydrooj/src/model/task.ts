import { hostname } from 'os';
import cac from 'cac';
import { BSON, Filter, ObjectId } from 'mongodb';
import { nanoid } from 'nanoid';
import { sleep } from '@hydrooj/utils/lib/utils';
import { Context } from '../context';
import { EventDoc, Task } from '../interface';
import { Logger } from '../logger';
import bus from '../service/bus';
import db from '../service/db';

const logger = new Logger('model/task');
const coll = db.collection('task');
const collEvent = db.collection('event');
const argv = cac().parse();

async function getFirst(query: Filter<Task>) {
    if (process.env.CI) return null;
    try {
        const q = { ...query };
        const res = await coll.findOneAndDelete(q, { sort: { priority: -1 } });
        if (res) {
            logger.debug('%o', res);
            return res;
        }
        return null;
    } catch (e) {
        // Usually caused by the database being down
        // Should recover once it is back
        logger.error(e);
        return null;
    }
}

export class Consumer {
    consuming: boolean;
    processing: Set<Task> = new Set();
    running?: any;
    notify: (res?: any) => void;

    constructor(public filter: any, public func: (t: Task) => Promise<void>, public destroyOnError = true, private concurrency = 1) {
        this.consuming = true;
        this.consume();
        bus.on('app/exit', this.destroy);
    }

    async consume() {
        while (this.consuming) {
            try {
                if (this.processing.size >= this.concurrency) {
                    // eslint-disable-next-line no-await-in-loop
                    await new Promise((resolve) => {
                        this.notify = resolve;
                    });
                    continue;
                }
                const res = await getFirst(this.filter); // eslint-disable-line no-await-in-loop
                if (!res) {
                    // eslint-disable-next-line no-await-in-loop
                    await Promise.race([
                        new Promise((resolve) => { this.notify = resolve; }),
                        sleep(1000 / (this.concurrency - this.processing.size)),
                    ]);
                    continue;
                }
                this.processing.add(res);
                this.func(res)
                    .catch((err) => {
                        logger.error(err);
                        if (this.destroyOnError) this.destroy();
                    })
                    .finally(() => {
                        this.processing.delete(res);
                        this.notify?.();
                    });
            } catch (err) {
                logger.error(err);
                if (this.destroyOnError) this.destroy();
            }
        }
    }

    async destroy() {
        this.consuming = false;
        this.notify?.();
    }

    setConcurrency(concurrency: number) {
        this.concurrency = concurrency;
        this.notify?.();
    }

    setQuery(query: string) {
        this.filter = query;
        this.notify?.();
    }
}

class TaskModel {
    static coll = coll;

    static async add(task: Partial<Task> & { type: string }) {
        const t: Task = {
            ...task,
            priority: task.priority ?? 0,
            _id: new ObjectId(),
        };
        const res = await coll.insertOne(t);
        return res.insertedId;
    }

    static async addMany(tasks: Task[]) {
        const res = await coll.insertMany(tasks);
        return res.insertedIds;
    }

    static get(_id: ObjectId) {
        return coll.findOne({ _id });
    }

    static count(query: Filter<Task>) {
        return coll.countDocuments(query);
    }

    static del(_id: ObjectId) {
        return coll.deleteOne({ _id });
    }

    static deleteMany(query: Filter<Task>) {
        return coll.deleteMany(query);
    }

    static getFirst = getFirst;

    static consume(query: any, cb: (t: Task) => Promise<void>, destroyOnError = true, concurrency = 1) {
        return new Consumer(query, cb, destroyOnError, concurrency);
    }
}

const id = process.env.exec_mode === 'cluster_mode' ? hostname() : nanoid();

export async function apply(ctx: Context) {
    ctx.on('domain/delete', (domainId) => coll.deleteMany({ domainId }));
    ctx.on('bus/broadcast', (event, payload, trace) => {
        collEvent.insertOne({
            ack: [id],
            event,
            payload: BSON.EJSON.stringify(payload),
            expire: new Date(Date.now() + 10000),
            trace,
        });
    });

    if (process.env.NODE_APP_INSTANCE !== '0') return;
    const stream = collEvent.watch();
    const handleEvent = async (doc: EventDoc) => {
        process.send?.({ type: 'hydro:broadcast', data: doc });
        const payload = BSON.EJSON.parse(doc.payload);
        await (bus.parallel as any)(doc.event, ...payload);
    };
    stream.on('change', async (change) => {
        if (change.operationType !== 'insert') return;
        if (change.fullDocument.ack.includes(id)) return;
        await handleEvent(change.fullDocument);
    });
    stream.on('error', async () => {
        // The $changeStream stage is only supported on replica sets
        logger.info('No replica set found.');
        while (true) {
            let res;
            try {
                // eslint-disable-next-line no-await-in-loop
                res = await collEvent.findOneAndUpdate(
                    { expire: { $gt: new Date() }, ack: { $nin: [id] } },
                    { $push: { ack: id } },
                );
            } catch (e) {
                logger.error(e);
                continue;
            }
            if (argv.options.showEvent) logger.info('Event: %o', res);
            // eslint-disable-next-line no-await-in-loop
            await (res ? handleEvent(res) : sleep(500));
        }
    });
    await db.ensureIndexes(collEvent, { name: 'expire', key: { expire: 1 }, expireAfterSeconds: 0 });
    await db.ensureIndexes(coll, { name: 'task', key: { type: 1, subType: 1, priority: -1 } });
}

export default TaskModel;
global.Hydro.model.task = TaskModel;
