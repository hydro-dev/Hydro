import moment from 'moment-timezone';
import { Filter, ObjectId } from 'mongodb';
import { Time } from '@hydrooj/utils';
import { STATUS } from '@hydrooj/utils/lib/status';
import { Context } from '../context';
import { Schedule } from '../interface';
import { Logger } from '../logger';
import db from '../service/db';
import type { WorkerService } from '../service/worker';
import * as DocumentModel from './document';
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
    /** @deprecated use ctx.inject(['worker'], cb) instead */
    static Worker: WorkerService;
}

export async function apply(ctx: Context) {
    ctx.inject(['worker'], (c) => {
        ScheduleModel.Worker = c.worker;
        c.worker.addHandler('task.daily', async () => {
            await RecordModel.coll.deleteMany({ contest: { $in: [RecordModel.RECORD_PRETEST, RecordModel.RECORD_GENERATE] } });
            const tdocs = await db.collection('document').find({
                docType: DocumentModel.TYPE_CONTEST,
                endAt: { $gt: new Date(Date.now() - 2 * Time.day) },
            }).project({ docId: 1, beginAt: 1 }).toArray();
            const first = Math.min(...tdocs.map((i) => i.beginAt.getTime()));
            const bulk = RecordModel.collStat.initializeUnorderedBulkOp();
            const cursor = RecordModel.coll.find({
                status: STATUS.STATUS_ACCEPTED,
                contest: { $in: tdocs.map((i) => i.docId) },
                _id: { $gt: Time.getObjectID(new Date(first)) },
            });
            for await (const rdoc of cursor) {
                bulk.find({ _id: rdoc._id }).upsert().updateOne({
                    domainId: rdoc.domainId,
                    pid: rdoc.pid,
                    uid: rdoc.uid,
                    time: rdoc.time,
                    memory: rdoc.memory,
                    length: rdoc.code?.length || 0,
                    lang: rdoc.lang,
                });
            }
            await bulk.execute();
            await global.Hydro.script.rp?.run({}, new Logger('task/rp').debug);
            await global.Hydro.script.problemStat?.run({}, new Logger('task/problem').debug);
            if (global.Hydro.model.system.get('server.checkUpdate') && !(new Date().getDay() % 3)) {
                await global.Hydro.script.checkUpdate?.run({}, new Logger('task/checkUpdate').debug);
            }
            await ctx.parallel('task/daily');
        });
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
