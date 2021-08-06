import moment from 'moment-timezone';
import { FilterQuery, ObjectID } from 'mongodb';
import { sleep } from '@hydrooj/utils/lib/utils';
import { BaseService, Task } from '../interface';
import { Logger } from '../logger';
import db from '../service/db';
import * as bus from '../service/bus';

const logger = new Logger('model/task');
const coll = db.collection('task');

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
                } else await sleep(100);
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
    public consumer: Consumer;
    public started = false;

    public start() {
        this.consumer = new Consumer(
            { type: 'schedule', subType: { $in: Object.keys(this.handlers) } },
            async (doc) => {
                try {
                    logger.debug('Worker task: %o', doc);
                    await this.handlers[doc.subType](doc);
                } catch (e) {
                    logger.error('Worker task fail: ', e);
                    logger.error('%o', doc);
                }
            },
            false,
        );
        this.started = true;
    }

    public addHandler(type: string, handler: Function) {
        this.handlers[type] = handler;
        this.consumer.filter = { type: 'schedule', subType: { $in: Object.keys(this.handlers) } };
    }
}

const Worker = new WorkerService();
Worker.start();

class TaskModel {
    static async add(task: Partial<Task> & { type: string }) {
        const t: Task = {
            ...task,
            count: task.count ?? 1,
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
        const res = await coll.findOne(query, { sort: { executeAfter: 1 } });
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

bus.on('domain/delete', (domainId) => coll.deleteMany({ domainId }));

export default TaskModel;
global.Hydro.model.task = TaskModel;
