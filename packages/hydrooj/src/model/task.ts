import { hostname } from 'os';
import cac from 'cac';
import { Filter, ObjectId } from 'mongodb';
import { nanoid } from 'nanoid';
import { sleep } from '@hydrooj/utils/lib/utils';
import { Context } from '../context';
import { EventDoc, Task } from '../interface';
import { Logger } from '../logger';
import * as bus from '../service/bus';
import db from '../service/db';

const logger = new Logger('model/task');
const coll = db.collection('task');
const collEvent = db.collection('event');
const argv = cac().parse();

async function getFirst(query: Filter<Task>) {
    if (process.env.CI) return null;
    const q = { ...query };
    const res = await coll.findOneAndDelete(q, { sort: { priority: -1 } });
    if (res.value) {
        logger.debug('%o', res.value);
        return res.value;
    }
    return null;
}

class Consumer {
    consuming: boolean;
    running?: any;

    constructor(public filter: any, public func: Function, public destoryOnError = true) {
        this.consuming = true;
        this.consume();
        bus.on('app/exit', this.destory);
    }

    async consume() {
        while (this.consuming) {
            try {
                // eslint-disable-next-line no-await-in-loop
                const res = await getFirst(this.filter);
                if (res) {
                    this.running = res;
                    // eslint-disable-next-line no-await-in-loop
                    await this.func(res);
                    this.running = null;
                    // eslint-disable-next-line no-await-in-loop
                } else await sleep(1000);
            } catch (err) {
                logger.error(err);
                if (this.destoryOnError) this.destory();
            }
        }
    }

    async destory() {
        this.consuming = false;
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

    static consume(query: any, cb: Function, destoryOnError = true) {
        return new Consumer(query, cb, destoryOnError);
    }
}

const id = process.env.exec_mode === 'cluster_mode' ? hostname() : nanoid();

export async function apply(ctx: Context) {
    ctx.on('domain/delete', (domainId) => coll.deleteMany({ domainId }));
    ctx.on('bus/broadcast', (event, payload) => {
        collEvent.insertOne({
            ack: [id],
            event,
            payload: JSON.stringify(payload),
            expire: new Date(Date.now() + 10000),
        });
    });

    if (process.env.NODE_APP_INSTANCE !== '0') return;
    const stream = collEvent.watch();
    const handleEvent = async (doc: EventDoc) => {
        const payload = JSON.parse(doc.payload);
        process.send?.({ type: 'hydro:broadcast', data: { event: doc.event, payload } });
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
        // eslint-disable-next-line no-constant-condition
        while (true) {
            // eslint-disable-next-line no-await-in-loop
            const res = await collEvent.findOneAndUpdate(
                { expire: { $gt: new Date() }, ack: { $nin: [id] } },
                { $push: { ack: id } },
            );
            if (argv.options.showEvent) logger.info('Event: %o', res.value);
            // eslint-disable-next-line no-await-in-loop
            await (res.value ? handleEvent(res.value) : sleep(500));
        }
    });
    await db.ensureIndexes(collEvent, { name: 'expire', key: { expire: 1 }, expireAfterSeconds: 0 });
    await db.ensureIndexes(coll, { name: 'task', key: { type: 1, subType: 1, priority: -1 } });
}

export default TaskModel;
global.Hydro.model.task = TaskModel;
