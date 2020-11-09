import moment from 'moment-timezone';
import { FilterQuery, ObjectID } from 'mongodb';
import { Task } from '../interface';
import { Logger } from '../logger';
import * as db from '../service/db';

const logger = new Logger('model/task');
const coll = db.collection('task');

export async function add(task: Partial<Task> & { type: string }) {
    const t: Task = {
        ...task,
        count: task.count ?? 1,
        priority: task.priority ?? 1,
        executeAfter: task.executeAfter || new Date(),
        _id: new ObjectID(),
    };
    const res = await coll.insertOne(t);
    return res.insertedId;
}

export function get(_id: ObjectID) {
    return coll.findOne({ _id });
}

export function count(query: FilterQuery<Task>) {
    return coll.find(query).count();
}

export function del(_id: ObjectID) {
    return coll.deleteOne({ _id });
}

export async function getFirst(query: FilterQuery<Task>) {
    const q = { ...query };
    q.executeAfter = q.executeAfter || { $lt: new Date() };
    const res = await coll.findOneAndDelete(q, { sort: { priority: -1 } });
    if (res.value) {
        logger.debug('%o', res.value);
        if (res.value.interval) {
            await coll.insertOne({
                ...res.value, executeAfter: moment().add(...res.value.interval).toDate(),
            });
        }
        return res.value;
    }
    return null;
}

export async function consume(query: any, cb: Function) {
    let isRunning = false;
    const interval = setInterval(async () => {
        if (isRunning) return;
        isRunning = true;
        const res = await getFirst(query);
        if (res) {
            try {
                await cb(res);
            } catch (e) {
                clearInterval(interval);
            }
        }
        isRunning = false;
    }, 100);
}

export class Consumer {
    consuming: boolean;

    running?: Promise<any>;

    interval: NodeJS.Timeout;

    filter: any;

    func: Function;

    constructor(filter: any, func: Function) {
        this.consuming = true;
        this.filter = filter;
        this.func = func;
        this.interval = setInterval(this.consume.bind(this), 100);
    }

    async consume() {
        if (this.running || !this.consuming) return;
        const res = await getFirst(this.filter);
        if (res) {
            this.running = this.func(res);
            if (this.running instanceof Promise) await this.running;
            this.running = null;
        }
    }

    async destory() {
        this.consuming = false;
        clearInterval(this.interval);
        if (this.running) await this.running;
    }
}

global.Hydro.model.task = {
    Consumer, add, get, del, count, getFirst, consume,
};
