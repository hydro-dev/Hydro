import { hostname } from 'os';
import moment from 'moment-timezone';
import { FilterQuery, ObjectID } from 'mongodb';
import { sleep } from '@hydrooj/utils/lib/utils';
import { BaseService, Task } from '../interface';
import { Logger } from '../logger';
import * as bus from '../service/bus';
import db from '../service/db';

const logger = new Logger('model/task');
const coll = db.collection('task');
const collEvent = db.collection('event');

async function getFirst(query: FilterQuery<Task>) {
    const q = { ...query };
    q.executeAfter = q.executeAfter || { $lt: new Date() };
    const res = await coll.findOneAndDelete(q, { sort: { priority: -1 } });
    if (res.value) {
        logger.debug('%o', res.value);
        if (res.value.interval) {
            const executeAfter = moment(res.value.executeAfter).add(...res.value.interval).toDate();
            await coll.insertOne({ ...res.value, executeAfter });
        }
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

class WorkerService implements BaseService {
    private handlers: Record<string, Function> = {};
    public started = true;
    public start = () => { };
    public consumer = new Consumer(
        { type: 'schedule', subType: { $in: Object.keys(this.handlers) } },
        async (doc) => {
            try {
                logger.debug('Worker task: %o', doc);
                const start = Date.now();
                await Promise.race([
                    this.handlers[doc.subType](doc),
                    new Promise((resolve) => setTimeout(resolve, 300000)),
                ]);
                const spent = Date.now() - start;
                if (spent > 500) logger.warn('Slow worker task (%d ms): %s', spent, doc);
            } catch (e) {
                logger.error('Worker task fail: ', e);
                logger.error('%o', doc);
            }
        },
        false,
    );

    public addHandler(type: string, handler: Function) {
        this.handlers[type] = handler;
        this.consumer.filter = { type: 'schedule', subType: { $in: Object.keys(this.handlers) } };
    }
}

const Worker = new WorkerService();

class TaskModel {
    static async add(task: Partial<Task> & { type: string }) {
        const t: Task = {
            ...task,
            priority: task.priority ?? 0,
            executeAfter: task.executeAfter || new Date(),
            _id: new ObjectID(),
        };
        const res = await coll.insertOne(t);
        return res.insertedId;
    }

    static get(_id: ObjectID) {
        return coll.findOne({ _id });
    }

    static count(query: FilterQuery<Task>) {
        return coll.find(query).count();
    }

    static del(_id: ObjectID) {
        return coll.deleteOne({ _id });
    }

    static deleteMany(query: FilterQuery<Task>) {
        return coll.deleteMany(query);
    }

    static getFirst = getFirst;

    static async getDelay(query?: FilterQuery<Task>): Promise<[number, Date]> {
        const now = new Date();
        const [res] = await coll.find(query).sort({ executeAfter: 1 }).limit(1).toArray();
        if (res) return [Math.max(0, now.getTime() - res.executeAfter.getTime()), res.executeAfter];
        return [0, now];
    }

    static async consume(query: any, cb: Function, destoryOnError = true) {
        return new Consumer(query, cb, destoryOnError);
    }

    static Consumer = Consumer;
    static WorkerService = WorkerService;
    static Worker = Worker;
}

const id = hostname();
Worker.addHandler('task.daily', async () => {
    await global.Hydro.model.record.coll.deleteMany({ contest: new ObjectID('000000000000000000000000') });
    await global.Hydro.script.rp?.run({}, new Logger('task/rp').debug);
    await global.Hydro.script.problemStat?.run({}, new Logger('task/problem').debug);
    if (global.Hydro.model.system.get('server.checkUpdate')) {
        await global.Hydro.script.checkVersion?.run({}, new Logger('task/checkUpdate').debug);
    }
});
bus.on('domain/delete', (domainId) => coll.deleteMany({ domainId }));
bus.once('app/started', async () => {
    if (process.env.NODE_APP_INSTANCE !== '0') return;
    if (!await TaskModel.count({ type: 'schedule', subType: 'task.daily' })) {
        await TaskModel.add({
            type: 'schedule',
            subType: 'task.daily',
            executeAfter: moment().add(1, 'day').hour(3).minute(0).second(0).millisecond(0).toDate(),
            interval: [1, 'day'],
        });
    }
    await collEvent.createIndex({ expire: 1 }, { expireAfterSeconds: 0 });
    (async () => {
        // eslint-disable-next-line no-constant-condition
        while (true) {
            // eslint-disable-next-line no-await-in-loop
            const res = await collEvent.findOneAndUpdate(
                { ack: { $nin: [id] } },
                { $push: { ack: id } },
            );
            // eslint-disable-next-line no-await-in-loop
            if (!res.value) await sleep(100);
            else {
                const payload = JSON.parse(res.value.payload);
                if (process.send) process.send({ type: 'hydro:broadcast', data: { event: res.value.event, payload } });
                if (res.value) bus.parallel(res.value.event, ...payload);
            }
        }
    })();
});
bus.on('bus/broadcast', (event, payload) => {
    collEvent.insertOne({
        ack: [id],
        event,
        payload: JSON.stringify(payload),
        expire: new Date(Date.now() + 10000),
    });
});

export default TaskModel;
global.Hydro.model.task = TaskModel;
