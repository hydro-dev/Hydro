import moment from 'moment-timezone';
import { FilterQuery, ObjectID } from 'mongodb';
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
    timeout: NodeJS.Timeout;

    constructor(public filter: any, public func: Function, public destoryOnError = true) {
        this.consuming = true;
        this.get = this.get.bind(this);
        this.get();
        this.destory = this.destory.bind(this);
        bus.on('app/exit', this.destory);
    }

    async get() {
        if (this.running || !this.consuming) return;
        try {
            const res = await getFirst(this.filter);
            if (res) {
                this.running = res;
                await this.func(res);
                this.running = null;
            }
        } catch (e) {
            logger.error(e);
            if (this.destoryOnError) this.destory();
        }
        this.timeout = setTimeout(this.get, 100);
    }

    async destory() {
        this.consuming = false;
        clearTimeout(this.timeout);
    }
}

class WorkerService implements BaseService {
    private handlers: Record<string, Function> = {};
    public consumer: Consumer;
    public started = false;

    public start() {
        this.consumer = new Consumer(
            { type: 'schedule', subType: { $in: Object.keys(this.handlers) } },
            (doc) => {
                logger.debug('Worker task: %o', doc);
                return this.handlers[doc.subType](doc);
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

    static getFirst = getFirst;

    static async getDelay(query?: FilterQuery<Task>) {
        const now = new Date();
        const res = await coll.findOne(query, { sort: { executeAfter: 1 } });
        if (res) return [Math.max(0, now.getTime() - res.executeAfter.getTime()), res.executeAfter];
        return [0, now];
    }

    static async consume(query: any, cb: Function) {
        return new Consumer(query, cb);
    }

    static Consumer = Consumer;
    static WorkerService = WorkerService;
    static Worker = Worker;
}

bus.on('domain/delete', (domainId) => coll.deleteMany({ domainId }));

export default TaskModel;
global.Hydro.model.task = TaskModel;
