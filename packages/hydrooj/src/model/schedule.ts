import moment from 'moment-timezone';
import { Filter, ObjectId } from 'mongodb';
import { Time } from '@hydrooj/utils';
import { Context } from '../context';
import { Schedule } from '../interface';
import { Logger } from '../logger';
import db from '../service/db';
import { } from '../service/worker';
import RecordModel from './record';

const logger = new Logger('model/schedule');
const coll = db.collection('schedule');

async function getFirst(query: Filter<Schedule>) {
    if (process.env.CI) return null;
    const q = { ...query };
    q.executeAfter ||= { $lt: new Date() };
    const res = await coll.findOneAndDelete(q);
    if (res) {
        logger.debug('%o', res);
        if (res.interval) {
            const executeAfter = moment(res.executeAfter).add(...res.interval).toDate();
            await coll.insertOne({ ...res, executeAfter });
        }
        return res;
    }
    return null;
}

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
}

export async function apply(ctx: Context) {
    ctx.on('domain/delete', (domainId) => coll.deleteMany({ domainId }));

    await ctx.inject(['worker'], (c) => {
        c.worker.addHandler('task.daily', async (task) => {
            const pref: Record<string, number> = {};
            let start = Date.now();
            if (start - task.executeAfter.getTime() > Time.week) {
                logger.warn('task.daily for date %s skipped', task.executeAfter.toISOString());
                return;
            }
            await RecordModel.coll.deleteMany({ contest: { $in: [RecordModel.RECORD_PRETEST, RecordModel.RECORD_GENERATE] } });
            pref.record = Date.now() - start;
            start = Date.now();
            await global.Hydro.script.rp?.run(pref, new Logger('task/rp').debug);
            pref.rp = Date.now() - start;
            start = Date.now();
            await global.Hydro.script.problemStat?.run(pref, new Logger('task/problem').debug);
            pref.problemStat = Date.now() - start;
            start = Date.now();
            if (global.Hydro.model.system.get('server.checkUpdate') && !(new Date().getDay() % 3)) {
                await global.Hydro.script.checkUpdate?.run({}, new Logger('task/checkUpdate').debug);
                pref.checkUpdate = Date.now() - start;
                start = Date.now();
            }
            await ctx.parallel('task/daily');
            pref.hook = Date.now() - start;
            logger.info('task/daily', pref);
            ctx.emit('task/daily/finish', pref);
        });
    });

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
