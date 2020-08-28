import {
    ObjectID, Collection, UpdateQuery, PushOperator, MatchKeysAndValues, OnlyFieldsOfType,
} from 'mongodb';
import { Dictionary } from 'lodash';
import { STATUS } from './builtin';
import * as task from './task';
import * as problem from './problem';
import {
    Rdoc, TestCase, PretestConfig, ContestInfo, ProblemConfig,
} from '../interface';
import * as db from '../service/db';

const coll: Collection<Rdoc> = db.collection('record');

export interface RdocBase {
    _id?: ObjectID,
    domainId?: string,
    pid: number
    uid: number,
    lang: string,
    code: string,
    score?: number,
    memory?: number,
    time?: number,
    judgeTexts?: string[],
    compilerTexts?: string[],
    testCases?: TestCase[],
    rejudged?: boolean,
    judger?: string,
    judgeAt?: Date,
    status?: number,
    type?: string,
    hidden?: boolean,
    input?: string,
    tid?: ObjectID,
    ttype?: number,
}

export interface JudgeTask {
    _id: ObjectID,
    rid: ObjectID,
    domainId: string,
    pid: number
    lang: string,
    code: string,
    data?: ObjectID,
    config: string,
    type?: string,
}

export async function get(domainId: string, _id: ObjectID): Promise<Rdoc | null> {
    const res = await coll.findOne({ _id });
    if (res && res.domainId === domainId) return res;
    return null;
}

export async function judge(domainId: string, rid: ObjectID) {
    const rdoc = await get(domainId, rid);
    let config: ProblemConfig = rdoc.config;
    if (!config) {
        const pdoc = await problem.get(domainId, rdoc.pid);
        config = pdoc?.config || {};
    }
    delete rdoc._id;
    await task.add({
        ...rdoc,
        type: 'judge',
        rid,
        domainId,
        config,
    });
}

export async function add(
    domainId: string, pid: number, uid: number,
    lang: string, code: string, addTask: boolean, contestOrConfig?: ContestInfo | PretestConfig,
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
        hidden: !!contestOrConfig,
        judgeTexts: [],
        compilerTexts: [],
        testCases: [],
        judger: null,
        judgeAt: null,
        rejudged: false,
    };
    if (contestOrConfig) {
        if ((contestOrConfig as ContestInfo).type) {
            data.contest = contestOrConfig as ContestInfo;
        } else {
            data.config = contestOrConfig as PretestConfig;
        }
    }
    const res = await coll.insertOne(data);
    if (addTask) await judge(domainId, res.insertedId);
    return res.insertedId;
}

export function getMulti(domainId: string, query: any) {
    return coll.find({ ...query, domainId });
}

export async function update(
    domainId: string, _id: ObjectID,
    $set?: MatchKeysAndValues<Rdoc>,
    $push?: PushOperator<Rdoc>,
    $unset?: OnlyFieldsOfType<Rdoc, any, true | '' | 1>,
): Promise<Rdoc | null> {
    const $update: UpdateQuery<Rdoc> = {};
    if ($set && Object.keys($set).length) $update.$set = $set;
    if ($push && Object.keys($push).length) $update.$push = $push;
    if ($unset && Object.keys($unset).length) $update.$unset = $unset;
    if (Object.keys($update).length) {
        const res = await coll.findOneAndUpdate(
            { _id, domainId },
            $update,
            { returnOriginal: false },
        );
        return res.value;
    }
    return await get(domainId, _id);
}

export function reset(domainId: string, rid: ObjectID, isRejudge: boolean) {
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
    return update(domainId, rid, upd);
}

export function count(domainId: string, query: any) {
    return coll.find({ domainId, ...query }).count();
}

export async function getList(
    domainId: string, rids: ObjectID[], showHidden: boolean,
): Promise<Dictionary<Rdoc>> {
    const r = {};
    rids = Array.from(new Set(rids));
    const rdocs = await coll.find({ domainId, _id: { $in: rids } }).toArray();
    for (const rdoc of rdocs) {
        if (rdoc.hidden && !showHidden) r[rdoc._id.toHexString()] = null;
        else r[rdoc._id.toHexString()] = rdoc;
    }
    return r;
}

export function getUserInProblemMulti(
    domainId: string, uid: number, pid: number,
    getHidden = false,
) {
    if (!getHidden) {
        return coll.find({
            domainId, uid, pid, hidden: false,
        });
    }
    return coll.find({ domainId, uid, pid });
}

export function getByUid(domainId: string, uid: number, limit: number): Promise<Rdoc[]> {
    return coll.find({ domainId, uid }).limit(limit).toArray();
}

global.Hydro.model.record = {
    add,
    get,
    getMulti,
    update,
    count,
    reset,
    getList,
    getUserInProblemMulti,
    getByUid,
    judge,
};
