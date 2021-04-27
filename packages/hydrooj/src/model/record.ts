import {
    ObjectID, Collection, UpdateQuery,
    PushOperator, MatchKeysAndValues, OnlyFieldsOfType,
    FilterQuery,
} from 'mongodb';
import { sum } from 'lodash';
import moment from 'moment';
import { STATUS } from './builtin';
import task from './task';
import problem from './problem';
import { Rdoc, ContestInfo, ProblemConfig } from '../interface';
import { ArgMethod, Time } from '../utils';
import { MaybeArray } from '../typeutils';
import * as bus from '../service/bus';
import db from '../service/db';

class RecordModel {
    static coll: Collection<Rdoc> = db.collection('record');

    static async submissionPriority(uid: number, base: number = 0) {
        const pending = await task.count({ uid });
        const timeRecent = await RecordModel.coll
            .find({ _id: { $gte: Time.getObjectID(moment().add(-1, 'hour')) }, uid }).project({ time: 1 }).toArray();
        return base - ((pending + 0.5) * (sum(timeRecent.map((i) => i.time || 0)) / 10000));
    }

    static async get(domainId: string, _id: ObjectID): Promise<Rdoc | null> {
        const res = await RecordModel.coll.findOne({ _id });
        if (res && res.domainId === domainId) return res;
        return null;
    }

    @ArgMethod
    static async stat(domainId?: string) {
        const [d5min, d1h, day, week, month, year, total] = await Promise.all([
            RecordModel.coll.find({ _id: { $gte: Time.getObjectID(moment().add(-5, 'minutes')) }, ...domainId ? { domainId } : {} }).count(),
            RecordModel.coll.find({ _id: { $gte: Time.getObjectID(moment().add(-1, 'hour')) }, ...domainId ? { domainId } : {} }).count(),
            RecordModel.coll.find({ _id: { $gte: Time.getObjectID(moment().add(-1, 'day')) }, ...domainId ? { domainId } : {} }).count(),
            RecordModel.coll.find({ _id: { $gte: Time.getObjectID(moment().add(-1, 'week')) }, ...domainId ? { domainId } : {} }).count(),
            RecordModel.coll.find({ _id: { $gte: Time.getObjectID(moment().add(-1, 'month')) }, ...domainId ? { domainId } : {} }).count(),
            RecordModel.coll.find({ _id: { $gte: Time.getObjectID(moment().add(-1, 'year')) }, ...domainId ? { domainId } : {} }).count(),
            RecordModel.coll.find(domainId ? { domainId } : {}).count(),
        ]);
        return {
            d5min, d1h, day, week, month, year, total,
        };
    }

    static async judge(domainId: string, rid: ObjectID, priority = 0, config: ProblemConfig = {}) {
        const rdoc = await RecordModel.get(domainId, rid);
        let data = [];
        if (rdoc.pid) {
            const pdoc = await problem.get(domainId, rdoc.pid);
            data = pdoc.data;
        }
        delete rdoc._id;
        await task.add({
            ...rdoc,
            priority,
            type: 'judge',
            rid,
            domainId,
            config,
            data,
        });
    }

    static async add(
        domainId: string, pid: number, uid: number,
        lang: string, code: string, addTask: boolean, contestOrConfig?: ContestInfo | string,
    ) {
        const data: Rdoc = {
            status: STATUS.STATUS_WAITING,
            _id: new ObjectID(),
            uid,
            code,
            lang,
            pid,
            domainId,
            score: 0,
            time: 0,
            memory: 0,
            hidden: false,
            judgeTexts: [],
            compilerTexts: [],
            testCases: [],
            judger: null,
            judgeAt: null,
            rejudged: false,
        };
        let isContest = false;
        if (typeof contestOrConfig === 'string') {
            // is Run
            data.input = contestOrConfig;
            data.hidden = true;
        } else {
            data.contest = contestOrConfig;
            isContest = true;
        }
        const res = await RecordModel.coll.insertOne(data);
        if (addTask) {
            const priority = await RecordModel.submissionPriority(uid, isContest ? 50 : 0);
            await RecordModel.judge(domainId, res.insertedId, priority);
        }
        return res.insertedId;
    }

    static getMulti(domainId: string, query: any) {
        return RecordModel.coll.find({ ...query, domainId });
    }

    static async update(
        domainId: string, _id: MaybeArray<ObjectID>,
        $set?: MatchKeysAndValues<Rdoc>,
        $push?: PushOperator<Rdoc>,
        $unset?: OnlyFieldsOfType<Rdoc, any, true | '' | 1>,
    ): Promise<Rdoc | null> {
        const $update: UpdateQuery<Rdoc> = {};
        if ($set && Object.keys($set).length) $update.$set = $set;
        if ($push && Object.keys($push).length) $update.$push = $push;
        if ($unset && Object.keys($unset).length) $update.$unset = $unset;
        if (_id instanceof Array) {
            await RecordModel.coll.updateMany({ _id: { $in: _id }, domainId }, $update);
            return null;
        }
        if (Object.keys($update).length) {
            const res = await RecordModel.coll.findOneAndUpdate(
                { _id, domainId },
                $update,
                { returnOriginal: false },
            );
            return res.value;
        }
        return await RecordModel.get(domainId, _id);
    }

    static async updateMulti(
        domainId: string, $match: FilterQuery<Rdoc>,
        $set?: MatchKeysAndValues<Rdoc>,
        $push?: PushOperator<Rdoc>,
        $unset?: OnlyFieldsOfType<Rdoc, any, true | '' | 1>,
    ) {
        const $update: UpdateQuery<Rdoc> = {};
        if ($set && Object.keys($set).length) $update.$set = $set;
        if ($push && Object.keys($push).length) $update.$push = $push;
        if ($unset && Object.keys($unset).length) $update.$unset = $unset;
        const res = await RecordModel.coll.updateMany({ domainId, ...$match }, $update);
        return res.modifiedCount;
    }

    static reset(domainId: string, rid: MaybeArray<ObjectID>, isRejudge: boolean) {
        const upd: any = {
            score: 0,
            status: STATUS.STATUS_WAITING,
            time: 0,
            memory: 0,
            testCases: [],
            judgeTexts: [],
            compilerTexts: [],
            judgeAt: null,
            judger: null,
        };
        if (isRejudge) upd.rejudged = true;
        return RecordModel.update(domainId, rid, upd);
    }

    static count(domainId: string, query: any) {
        return RecordModel.coll.find({ domainId, ...query }).count();
    }

    static async getList(
        domainId: string, rids: ObjectID[], showHidden: boolean,
    ): Promise<Record<string, Rdoc>> {
        const r = {};
        rids = Array.from(new Set(rids));
        const rdocs = await RecordModel.coll.find({ domainId, _id: { $in: rids } }).toArray();
        for (const rdoc of rdocs) {
            if (rdoc.hidden && !showHidden) r[rdoc._id.toHexString()] = null;
            else r[rdoc._id.toHexString()] = rdoc;
        }
        return r;
    }

    @ArgMethod
    static getUserInProblemMulti(
        domainId: string, uid: number, pid: number,
        getHidden: boolean = false,
    ) {
        if (!getHidden) {
            return RecordModel.coll.find({
                domainId, uid, pid, hidden: false,
            });
        }
        return RecordModel.coll.find({ domainId, uid, pid });
    }

    @ArgMethod
    static getByUid(domainId: string, uid: number, limit: number): Promise<Rdoc[]> {
        return RecordModel.coll.find({ domainId, uid, hidden: false }).sort({ _id: -1 }).limit(limit).toArray();
    }
}

bus.on('problem/delete', (domainId, docId) => RecordModel.coll.deleteMany({ domainId, pid: docId }));
export default RecordModel;
global.Hydro.model.record = RecordModel;
