import _ from 'lodash';
import yaml from 'js-yaml';
import { ObjectID } from 'mongodb';
import { STATUS } from './builtin';
import * as task from './task';
import * as problem from './problem';
import { Rdoc, TestCase } from '../interface';
import { RecordNotFoundError } from '../error';
import * as db from '../service/db';

const coll = db.collection('record');

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

export async function add(domainId: string, data: RdocBase, addTask = true) {
    _.defaults(data, {
        status: STATUS.STATUS_WAITING,
        type: 'judge',
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
    });
    const [pdoc, res] = await Promise.all([
        problem.get(domainId, data.pid, null, false),
        coll.insertOne(data),
    ]);
    if (addTask) {
        const t: any = {
            type: data.type || 'judge',
            rid: res.insertedId,
            domainId,
            pid: data.pid,
            lang: data.lang,
            code: data.code,
        };
        if (t.type === 'judge') {
            t.data = pdoc.data;
            t.config = pdoc.config;
        } else {
            t.config = yaml.safeDump({
                time: data.time,
                memory: data.memory,
                input: data.input,
            });
        }
        await task.add(t);
    }
    return res.insertedId;
}

export async function get(domainId: string, _id: ObjectID): Promise<Rdoc> {
    const rdoc = await coll.findOne({ domainId, _id });
    if (!rdoc) throw new RecordNotFoundError(_id);
    return rdoc;
}

export function getMulti(domainId: string, query: any) {
    return coll.find({ ...query, domainId });
}

export async function update(
    domainId: string, _id: ObjectID,
    $set: any = {}, $push: any = {}, $unset: any = {},
): Promise<Rdoc> {
    const $update: any = {};
    if ($set && Object.keys($set).length) $update.$set = $set;
    if ($push && Object.keys($push).length) $update.$push = $push;
    if ($unset && Object.keys($unset).length) $update.$unset = $unset;
    const res = await coll.findOneAndUpdate({ domainId, _id }, $update, { returnOriginal: false });
    if (!res.value) throw new RecordNotFoundError(_id);
    return res.value;
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
    domainId: string, rids: ObjectID[], showHidden = false,
): Promise<{ [key: string]: Rdoc }> {
    const r = {};
    for (const rid of rids) {
        // eslint-disable-next-line no-await-in-loop
        const rdoc = await get(domainId, rid);
        if (rdoc.hidden && !showHidden) r[rid.toHexString()] = null;
        else r[rid.toHexString()] = rdoc;
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

export function getByUid(domainId: string, uid: number): Promise<Rdoc[]> {
    return coll.find({ domainId, uid }).toArray();
}

export async function judge(domainId: string, rid: ObjectID) {
    const rdoc = await get(domainId, rid);
    const pdoc = await problem.get(domainId, rdoc.pid);
    await task.add({
        type: 'judge',
        rid,
        domainId,
        config: pdoc.config || '',
        pid: rdoc.pid,
        data: pdoc.data,
        lang: rdoc.lang,
        code: rdoc.code,
    });
}

export async function rejudge(domainId: string, rid: ObjectID) {
    await reset(domainId, rid, true);
    const rdoc = await get(domainId, rid);
    const pdoc = await problem.get(domainId, rdoc.pid);
    await task.add({
        type: 'judge',
        rid,
        domainId,
        pid: rdoc.pid,
        data: pdoc.data,
        lang: rdoc.lang,
        code: rdoc.code,
    });
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
    rejudge,
};
