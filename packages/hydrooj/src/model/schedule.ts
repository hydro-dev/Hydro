import moment from 'moment-timezone';
import { Filter, ObjectId } from 'mongodb';
import { sleep } from '@hydrooj/utils/lib/utils';
import { Context, Service } from '../context';
import { Schedule } from '../interface';
import { Logger } from '../logger';
import * as bus from '../service/bus';
import db from '../service/db';
import RecordModel from './record';

const logger = new Logger('model/schedule');
const coll = db.collection('schedule');

async function getFirst(query: Filter<Schedule>) {
    if (process.env.CI) return null;
    const q = { ...query };
    q.executeAfter ||= { $lt: new Date() };
    const res = await coll.findOneAndDelete(q);
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

class WorkerService extends Service {
    private handlers: Record<string, Function> = {};
    public consumer = new Consumer(
        { type: 'schedule', subType: { $in: Object.keys(this.handlers) } },
        async (doc) => {
            try {
                logger.debug('Worker task: %o', doc);
                const start = Date.now();
                await Promise.race([
                    this.handlers[doc.subType](doc),
                    sleep(1200000),
                ]);
                const spent = Date.now() - start;
                if (spent > 500) logger.warn('Slow worker task (%d ms): %o', spent, doc);
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
        this.caller?.on('dispose', () => {
            delete this.handlers[type];
        });
    }
}

const Worker = new WorkerService(app, 'worker', false);

class ScheduleModel {
    static coll = coll;

    static async add(task: Partial<Schedule> & { type: string }) {
        const res = await coll.insertOne({
            ...task,
            executeAfter: task.executeAfter || new Date(),
            _id: new ObjectId(),
        });
        return res.insertedId;
    }

    static get(_id: ObjectId) {
        return coll.findOne({ _id });
    }

    static count(query: Filter<Schedule>) {
        return coll.countDocuments(query);
    }

    static del(_id: ObjectId) {
        return coll.deleteOne({ _id });
    }

    static deleteMany(query: Filter<Schedule>) {
        return coll.deleteMany(query);
    }

    static getFirst = getFirst;
    static Worker = Worker;
}

declare module '../context' {
    interface Context {
        worker: WorkerService;
    }
}

export async function apply(ctx: Context) {
    Context.service('worker', WorkerService);
    ctx.worker = Worker;

    Worker.addHandler('task.daily', async () => {
        await RecordModel.coll.deleteMany({ contest: { $in: [RecordModel.RECORD_PRETEST, RecordModel.RECORD_GENERATE] } });
        await global.Hydro.script.rp?.run({}, new Logger('task/rp').debug);
        await global.Hydro.script.problemStat?.run({}, new Logger('task/problem').debug);
        if (global.Hydro.model.system.get('server.checkUpdate') && !(new Date().getDay() % 3)) {
            await global.Hydro.script.checkUpdate?.run({}, new Logger('task/checkUpdate').debug);
        }
        await ctx.parallel('task/daily');
    });
    ctx.on('domain/delete', (domainId) => coll.deleteMany({ domainId }));

    if (process.env.NODE_APP_INSTANCE !== '0') return;
    if (!await ScheduleModel.count({ type: 'schedule', subType: 'task.daily' })) {
        await ScheduleModel.add({
            type: 'schedule',
            subType: 'task.daily',
            executeAfter: moment().add(1, 'day').hour(3).minute(0).second(0).millisecond(0).toDate(),
            interval: [1, 'day'],
        });
    }
    await db.ensureIndexes(coll, { name: 'schedule', key: { type: 1, subType: 1, executeAfter: -1 } });
}

export default ScheduleModel;
global.Hydro.model.schedule = ScheduleModel;
