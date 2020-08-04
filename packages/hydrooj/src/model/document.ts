import assert from 'assert';
import { ObjectID } from 'mongodb';
import * as db from '../service/db';

type DocID = ObjectID | string | number;

const coll = db.collection('document');
const collStatus = db.collection('document.status');

export const TYPE_PROBLEM = 10;
export const TYPE_PROBLEM_SOLUTION = 11;
export const TYPE_PROBLEM_LIST = 12;
export const TYPE_DISCUSSION_NODE = 20;
export const TYPE_DISCUSSION = 21;
export const TYPE_DISCUSSION_REPLY = 22;
export const TYPE_CONTEST = 30;
export const TYPE_TRAINING = 40;
export const TYPE_FILE = 50;
export const TYPE_HOMEWORK = 60;

export async function add<T extends DocID>(
    domainId: string, content: string, owner: number,
    docType: number, docId: T,
    parentType?: number | null, parentId?: DocID,
    args?: any,
): Promise<T>
export async function add(
    domainId: string, content: string, owner: number,
    docType: number, docId: null,
    parentType?: number, parentId?: DocID,
    args?: any,
): Promise<ObjectID>
export async function add(
    domainId: string, content: string, owner: number,
    docType: number, docId: DocID = null,
    parentType: number | null = null, parentId: DocID = null,
    args: any = {},
) {
    const _id = new ObjectID();
    const doc: any = {
        _id,
        content,
        owner,
        domainId,
        docType,
        docId: docId || _id,
        ...args,
    };
    if (parentType || parentId) {
        assert(parentType && parentId);
        doc.parentType = parentType;
        doc.parentId = parentId;
    }
    const res = await coll.insertOne(doc);
    return docId || res.insertedId;
}

export function get(domainId: string, docType: number, docId: DocID) {
    return coll.findOne({ domainId, docType, docId });
}

export async function set(domainId: string, docType: number, docId: DocID, args: any) {
    const res = await coll.findOneAndUpdate(
        { domainId, docType, docId },
        { $set: args },
        { returnOriginal: false, upsert: true },
    );
    return res.value;
}

export function deleteOne(domainId: string, docType: number, docId: DocID) {
    return Promise.all([
        collStatus.deleteMany({ domainId, docType, docId }),
        coll.deleteOne({ domainId, docType, docId }),
    ]);
}

export function deleteMulti(domainId: string, docType: number, args: any = {}) {
    return coll.deleteMany({ ...args, domainId, docType });
}

export function deleteMultiStatus(domainId: string, docType: number, args: any = {}) {
    return collStatus.deleteMany({ ...args, domainId, docType });
}

export function getMulti(domainId: string, docType: number, args: any = {}) {
    return coll.find({ ...args, docType, domainId });
}

export async function inc(
    domainId: string, docType: number, docId: DocID,
    key: string, value: number,
) {
    const res = await coll.findOneAndUpdate(
        { domainId, docType, docId },
        { $inc: { [key]: value } },
        { returnOriginal: false },
    );
    return res.value;
}

export async function incAndSet(
    domainId: string, docType: number, docId: DocID,
    key: string, value: number, args: any,
) {
    const res = await coll.findOneAndUpdate(
        { domainId, docType, docId },
        { $inc: { [key]: value }, $set: args },
        { returnOriginal: false },
    );
    return res.value;
}

export function count(domainId: string, docType: number, query: any) {
    return coll.find({ ...query, docType, domainId }).count();
}

export async function push(
    domainId: string, docType: number, docId: DocID,
    key: string, content: string, owner: number, args: any = {},
) {
    const _id = new ObjectID();
    const doc = await coll.findOneAndUpdate(
        { domainId, docType, docId },
        {
            $push: {
                [key]: {
                    ...args, content, owner, _id,
                },
            },
        },
        { returnOriginal: false },
    );
    return [doc.value, _id];
}

export async function pull(
    domainId: string, docType: number, docId: DocID,
    setKey: string, contents: string[],
) {
    const res = await coll.findOneAndUpdate(
        { domainId, docType, docId },
        { $pull: { [setKey]: { $in: contents } } },
        { returnOriginal: false },
    );
    return res.value;
}

export async function deleteSub(
    domainId: string, docType: number, docId: DocID,
    key: string, subId: ObjectID,
) {
    const res = await coll.findOneAndUpdate(
        { domainId, docType, docId },
        { $pull: { [key]: { _id: subId } } },
        { returnOriginal: false },
    );
    return res.value;
}

export async function getSub(
    domainId: string, docType: number, docId: DocID,
    key: string, subId: ObjectID,
) {
    const doc = await coll.findOne({
        domainId,
        docType,
        docId,
        [key]: { $elemMatch: { _id: subId } },
    });
    if (!doc) return [null, null];
    for (const sdoc of doc[key] || []) {
        if (sdoc._id === subId) return [doc, sdoc];
    }
    return [doc, null];
}

export async function setSub(
    domainId: string, docType: number, docId: DocID,
    key: string, subId: ObjectID, args: any,
) {
    const $set = {};
    for (const k in args) {
        $set[`${key}.$.${k}`] = args[k];
    }
    const res = await coll.findOneAndUpdate(
        {
            domainId,
            docType,
            docId,
            [key]: { $elemMatch: { _id: subId } },
        },
        { $set },
        { returnOriginal: false },
    );
    return res.value;
}

export async function addToSet(
    domainId: string, docType: number, docId: DocID,
    setKey: string, content: string,
) {
    const res = await coll.findOneAndUpdate(
        { domainId, docType, docId },
        { $addToSet: { [setKey]: content } },
        { returnOriginal: false },
    );
    return res.value;
}

export function getStatus(domainId: string, docType: number, docId: DocID, uid: number) {
    return collStatus.findOne({
        domainId, docType, docId, uid,
    });
}

export function getMultiStatus(domainId: string, docType: number, args: any) {
    return collStatus.find({ ...args, docType, domainId });
}

export function getMultiStatusWithoutDomain(docType: number, args: any) {
    return collStatus.find({ ...args, docType });
}

export async function setStatus(
    domainId: string, docType: number, docId: DocID, uid: number, args: any,
) {
    const res = await collStatus.findOneAndUpdate(
        {
            domainId, docType, docId, uid,
        },
        { $set: args },
        { upsert: true, returnOriginal: false },
    );
    return res.value;
}

export function setMultiStatus(domainId: string, docType: number, query: any, args: any) {
    return collStatus.updateMany(
        { domainId, docType, ...query },
        { $set: args },
    );
}

export async function setIfNotStatus(
    domainId: string, docType: number, docId: DocID, uid: number,
    key: string, value: number, ifNot: any, args: any,
) {
    const res = await collStatus.findOneAndUpdate(
        {
            domainId, docType, docId, uid, key: { $not: { $eq: ifNot } },
        },
        { $set: { [key]: value, ...args } },
        { upsert: true, returnOriginal: false },
    );
    return res.value;
}

export async function cappedIncStatus(
    domainId: string, docType: number, docId: DocID, uid: number,
    key: string, value: number, minValue = -1, maxValue = 1,
) {
    assert(value !== 0);
    const $not = value > 0 ? { $gte: maxValue } : { $lte: minValue };
    const res = await collStatus.findOneAndUpdate(
        {
            domainId, docType, docId, uid, [key]: { $not },
        },
        { $inc: { [key]: value } },
        { upsert: true, returnOriginal: false },
    );
    return res.value;
}

export async function incStatus(
    domainId: string, docType: number, docId: DocID, uid: number,
    key: string, value: number,
) {
    const res = await collStatus.findOneAndUpdate(
        {
            domainId, docType, docId, uid,
        },
        { $inc: { [key]: value } },
        { upsert: true, returnOriginal: false },
    );
    return res.value;
}

export async function revPushStatus(
    domainId: string, docType: number, docId: DocID, uid: number,
    key: string, value: any,
) {
    const res = await collStatus.findOneAndUpdate(
        {
            domainId, docType, docId, uid,
        },
        { $push: { [key]: value }, $inc: { rev: 1 } },
        { upsert: true, returnOriginal: false },
    );
    return res.value;
}

export async function revInitStatus(
    domainId: string, docType: number, docId: DocID, uid: number,
) {
    const res = await collStatus.findOneAndUpdate(
        {
            domainId, docType, docId, uid,
        },
        { $inc: { rev: 1 } },
        { upsert: true, returnOriginal: false },
    );
    return res.value;
}

export async function revSetStatus(
    domainId: string, docType: number, docId: DocID, uid: number,
    rev: number, args: any, returnDoc = true,
) {
    const filter = {
        domainId, docType, docId, uid, rev,
    };
    const update = { $set: args, $inc: { rev: 1 } };
    if (returnDoc) {
        const res = await collStatus.findOneAndUpdate(filter, update, { returnOriginal: false });
        return res.value;
    }
    return await collStatus.updateOne(filter, update);
}

/* eslint-disable object-curly-newline */
async function ensureIndexes() {
    const ic = coll.createIndex.bind(coll);
    const is = collStatus.createIndex.bind(coll);
    const u = { unique: true };
    const s = { sparse: true };
    await ic({ domainId: 1, docType: 1, docId: 1 }, u);
    await ic({ domainId: 1, docType: 1, owner: 1, docId: -1 });
    // For problem
    await ic({ domainId: 1, docType: 1, category: 1, docId: 1 }, s);
    await ic({ domainId: 1, docType: 1, hidden: 1, category: 1, docId: 1 }, s);
    await ic({ domainId: 1, docType: 1, tag: 1, docId: 1 }, s);
    await ic({ domainId: 1, docType: 1, hidden: 1, tag: 1, docId: 1 }, s);
    // For problem solution
    await ic({ domainId: 1, docType: 1, parentType: 1, parentId: 1, vote: -1, docId: -1 }, s);
    // For discussion
    await ic({ domainId: 1, docType: 1, pin: -1, updateAt: -1, docId: -1 }, s);
    await ic({ domainId: 1, docType: 1, parentType: 1, parentId: 1, updateAt: -1, docId: -1 }, s);
    // Hidden doc
    await ic({ domainId: 1, docType: 1, hidden: 1, docId: -1 }, s);
    // For contest
    await ic({ domainId: 1, docType: 1, pids: 1 }, s);
    await ic({ domainId: 1, docType: 1, rule: 1, docId: -1 }, s);
    // For training
    await ic({ domainId: 1, docType: 1, 'dag.pids': 1 }, s);
    await is({ domainId: 1, docType: 1, uid: 1, docId: 1 }, u);
    // For rp system
    await is({ domainId: 1, docType: 1, docId: 1, status: 1, rid: 1, rp: 1 }, s);
    // For contest rule OI
    await is({ domainId: 1, docType: 1, docId: 1, score: -1 }, s);
    // For contest rule ACM
    await is({ domainId: 1, docType: 1, docId: 1, accept: -1, time: 1 }, s);
    // For training
    await is({ domainId: 1, docType: 1, uid: 1, enroll: 1, docId: 1 }, s);
}

global.Hydro.postInit.push(ensureIndexes);
global.Hydro.model.document = {
    add,
    addToSet,
    cappedIncStatus,
    count,
    deleteMulti,
    deleteMultiStatus,
    deleteOne,
    deleteSub,
    get,
    getMulti,
    getMultiStatus,
    getMultiStatusWithoutDomain,
    getStatus,
    getSub,
    inc,
    incAndSet,
    incStatus,
    pull,
    push,
    revInitStatus,
    revPushStatus,
    revSetStatus,
    set,
    setIfNotStatus,
    setStatus,
    setMultiStatus,
    setSub,

    TYPE_CONTEST,
    TYPE_DISCUSSION,
    TYPE_DISCUSSION_NODE,
    TYPE_DISCUSSION_REPLY,
    TYPE_HOMEWORK,
    TYPE_PROBLEM,
    TYPE_PROBLEM_LIST,
    TYPE_PROBLEM_SOLUTION,
    TYPE_FILE,
    TYPE_TRAINING,
};
