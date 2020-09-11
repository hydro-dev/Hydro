import assert from 'assert';
import {
    ObjectID, Cursor, FilterQuery, UpdateQuery,
} from 'mongodb';
import * as db from '../service/db';
import * as bus from '../service/bus';
import {
    Pdoc, Ddoc, Ufdoc, Drdoc, Tdoc, TrainingDoc, NumberKeys, ArrayKeys, ProblemStatusDoc,
} from '../interface';

type DocID = ObjectID | string | number;

export const coll = db.collection('document');
export const collStatus = db.collection('document.status');

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

export interface DocType {
    [TYPE_PROBLEM]: Pdoc,
    [TYPE_PROBLEM_SOLUTION]: any,
    [TYPE_PROBLEM_LIST]: any,
    [TYPE_DISCUSSION_NODE]: any,
    [TYPE_DISCUSSION]: Ddoc,
    [TYPE_DISCUSSION_REPLY]: Drdoc,
    [TYPE_CONTEST]: Tdoc,
    [TYPE_TRAINING]: TrainingDoc,
    [TYPE_FILE]: Ufdoc,
    [TYPE_HOMEWORK]: Tdoc,
}

export interface DocStatusType {
    [TYPE_PROBLEM]: ProblemStatusDoc,
    [key: number]: any
}

export async function add<T extends DocID, K extends keyof DocType>(
    domainId: string, content: string, owner: number,
    docType: K, docId: DocType[K]['docId'],
    parentType?: number | null, parentId?: DocID,
    args?: any,
): Promise<T>
export async function add<K extends keyof DocType>(
    domainId: string, content: string, owner: number,
    docType: K, docId: null,
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
    await bus.serial('document/add', doc);
    const res = await coll.insertOne(doc);
    return docId || res.insertedId;
}

export function get<K extends keyof DocType>(domainId: string, docType: K, docId: DocType[K]['docId']) {
    return coll.findOne({ domainId, docType, docId });
}

export async function set<K extends keyof DocType>(
    domainId: string, docType: K, docId: DocType[K]['docId'], $set: Partial<DocType[K]>,
): Promise<DocType[K]> {
    await bus.parallel('document/set', domainId, docType, docId, $set);
    const res = await coll.findOneAndUpdate(
        { domainId, docType, docId },
        { $set },
        { returnOriginal: false, upsert: true },
    );
    return res.value;
}

export function deleteOne<K extends keyof DocType>(
    domainId: string, docType: K, docId: DocType[K]['docId'],
) {
    return Promise.all([
        collStatus.deleteMany({ domainId, docType, docId }),
        coll.deleteOne({ domainId, docType, docId }),
    ]);
}

export function deleteMulti<K extends keyof DocType>(
    domainId: string, docType: K, query?: FilterQuery<DocType[K]>,
) {
    return coll.deleteMany({ ...query, domainId, docType });
}

export function deleteMultiStatus<K extends keyof DocStatusType>(
    domainId: string, docType: K, query?: FilterQuery<DocStatusType[K]>,
) {
    return collStatus.deleteMany({ ...query, domainId, docType });
}

export function getMulti<K extends keyof DocType>(
    domainId: string, docType: K, query?: FilterQuery<DocType[K]>,
): Cursor<DocType[K]> {
    return coll.find({ ...query, docType, domainId });
}

export async function inc<K extends keyof DocType>(
    domainId: string, docType: K, docId: DocType[K]['docId'],
    key: NumberKeys<DocType[K]>, value: number,
) {
    const res = await coll.findOneAndUpdate(
        { domainId, docType, docId },
        { $inc: { [key]: value } },
        { returnOriginal: false },
    );
    return res.value;
}

export async function incAndSet<K extends keyof DocType>(
    domainId: string, docType: K, docId: DocType[K]['docId'],
    key: NumberKeys<DocType[K]>, value: number, args: Partial<DocType[K]>,
) {
    const res = await coll.findOneAndUpdate(
        { domainId, docType, docId },
        { $inc: { [key]: value }, $set: args },
        { returnOriginal: false },
    );
    return res.value;
}

export function count<K extends keyof DocType>(
    domainId: string, docType: K, query?: FilterQuery<DocType[K]>,
) {
    return coll.find({ ...query, docType, domainId }).count();
}

export async function push<K extends keyof DocType, T extends keyof DocType[K]>(
    domainId: string, docType: K, docId: DocType[K]['docId'],
    key: keyof DocType[K], content: string, owner: number, args: DocType[K][T][0] = {},
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

export async function pull<K extends keyof DocType>(
    domainId: string, docType: K, docId: DocType[K]['docId'],
    setKey: ArrayKeys<DocType[K]>, contents: string[],
): Promise<DocType[K]> {
    const res = await coll.findOneAndUpdate(
        { domainId, docType, docId },
        { $pull: { [setKey]: { $in: contents } } },
        { returnOriginal: false },
    );
    return res.value;
}

export async function deleteSub<K extends keyof DocType>(
    domainId: string, docType: K, docId: DocType[K]['docId'],
    key: ArrayKeys<DocType[K]>, subId: ObjectID,
): Promise<DocType[K]> {
    const res = await coll.findOneAndUpdate(
        { domainId, docType, docId },
        { $pull: { [key]: { _id: subId } } },
        { returnOriginal: false },
    );
    return res.value;
}

export async function getSub<T extends keyof DocType, K extends ArrayKeys<DocType[T]>>(
    domainId: string, docType: T, docId: DocType[T]['docId'],
    key: K, subId: ObjectID,
): Promise<[DocType[T], DocType[T][K]][0]> {
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

export async function setSub<T extends keyof DocType, K extends ArrayKeys<DocType[T]>>(
    domainId: string, docType: T, docId: DocType[T]['docId'],
    key: K, subId: ObjectID, args: UpdateQuery<DocType[T][K][0]>['$set'],
): Promise<DocType[T]> {
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

export async function addToSet<T extends keyof DocType, K extends ArrayKeys<DocType[T], string>>(
    domainId: string, docType: T, docId: DocType[T]['docId'],
    setKey: K, content: string,
) {
    const res = await coll.findOneAndUpdate(
        { domainId, docType, docId },
        { $addToSet: { [setKey]: content } },
        { returnOriginal: false },
    );
    return res.value;
}

export function getStatus<K extends keyof DocStatusType>(
    domainId: string, docType: K, docId: DocStatusType[K]['docId'], uid: number,
): Promise<DocStatusType[K]> {
    return collStatus.findOne({
        domainId, docType, docId, uid,
    });
}

export function getMultiStatus<K extends keyof DocStatusType>(
    domainId: string, docType: K, args: FilterQuery<DocStatusType[K]>,
): Cursor<DocStatusType[K]> {
    return collStatus.find({ ...args, docType, domainId });
}

export function getMultiStatusWithoutDomain<K extends keyof DocStatusType>(
    docType: K, args: FilterQuery<DocStatusType[K]>,
): Cursor<DocStatusType[K]> {
    return collStatus.find({ ...args, docType });
}

export async function setStatus<K extends keyof DocStatusType>(
    domainId: string, docType: K, docId: DocStatusType[K]['docId'], uid: number, args: UpdateQuery<DocStatusType[K]>['$set'],
): Promise<DocStatusType[K]> {
    const res = await collStatus.findOneAndUpdate(
        {
            domainId, docType, docId, uid,
        },
        { $set: args },
        { upsert: true, returnOriginal: false },
    );
    return res.value;
}

export function setMultiStatus<K extends keyof DocStatusType>(
    domainId: string, docType: K, query: FilterQuery<DocStatusType[K]>, args: UpdateQuery<DocStatusType[K]>['$set'],
) {
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
    await ic({ domainId: 1, docType: 1, search: 'text', title: 'text' }, s);
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

bus.once('app/started', ensureIndexes);
global.Hydro.model.document = {
    coll,
    collStatus,

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
