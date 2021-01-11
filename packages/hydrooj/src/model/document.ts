/* eslint-disable object-curly-newline */
import assert from 'assert';
import {
    ObjectID, Cursor, FilterQuery, UpdateQuery, OnlyFieldsOfType,
} from 'mongodb';
import {
    Pdoc, Ddoc, Drdoc, Tdoc, TrainingDoc, ProblemStatusDoc,
} from '../interface';
import { buildProjection } from '../utils';
import { NumberKeys, ArrayKeys, Projection } from '../typeutils';
import db from '../service/db';
import * as bus from '../service/bus';
import { Content } from '../loader';

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
    [TYPE_HOMEWORK]: Tdoc,
}

export interface DocStatusType {
    [TYPE_PROBLEM]: ProblemStatusDoc,
    [key: number]: any
}

export async function add<T extends keyof DocType, K extends DocType[T]['docId']>(
    domainId: string, content: Content, owner: number,
    docType: T, docId: K,
    parentType?: DocType[T]['parentType'], parentId?: DocType[T]['parentId'],
    args?: Partial<DocType[T]>,
): Promise<K>
export async function add<T extends keyof DocType>(
    domainId: string, content: Content, owner: number,
    docType: T, docId: null,
    parentType?: DocType[T]['parentType'], parentId?: DocType[T]['parentId'],
    args?: Partial<DocType[T]>,
): Promise<ObjectID>
export async function add(
    domainId: string, content: Content, owner: number,
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

export async function get<K extends keyof DocType>(domainId: string, docType: K, docId: DocType[K]['docId'], projection?: Projection<DocType[K]>) {
    let cursor = coll.find({ domainId, docType, docId }).limit(1);
    if (projection) cursor = cursor.project(buildProjection(projection));
    const result = await cursor.toArray();
    if (result.length) return result[0];
    return null;
}

export async function set<K extends keyof DocType>(
    domainId: string, docType: K, docId: DocType[K]['docId'], $set?: Partial<DocType[K]>, $unset?: OnlyFieldsOfType<DocType[K], any, true | '' | 1>,
): Promise<DocType[K]> {
    await bus.parallel('document/set', domainId, docType, docId, $set, $unset);
    const update: UpdateQuery<DocType[K]> = {};
    if ($set) update.$set = $set;
    if ($unset) update.$unset = $unset;
    const res = await coll.findOneAndUpdate(
        { domainId, docType, docId },
        update,
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
    domainId: string, docType: K, query?: FilterQuery<DocType[K]>, projection?: Projection<DocType[K]>,
): Cursor<DocType[K]> {
    let cursor = coll.find({ ...query, docType, domainId });
    if (projection) cursor = cursor.project(buildProjection(projection));
    return cursor;
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
    key: ArrayKeys<DocType[K]>, value: DocType[K][0],
): Promise<[DocType[K], ObjectID]>
export async function push<K extends keyof DocType, T extends keyof DocType[K]>(
    domainId: string, docType: K, docId: DocType[K]['docId'],
    key: keyof DocType[K], content: string, owner: number, args?: DocType[K][T][0],
): Promise<[DocType[K], ObjectID]>
export async function push(
    domainId: string, docType: number, docId: DocID, key: string,
    arg0: any, arg1?: any, arg2?: any,
) {
    const _id = arg2?._id || arg0?._id || new ObjectID();
    const v = arg1
        ? { _id, ...arg2, content: arg0, owner: arg1 }
        : { _id, ...arg0 };
    const doc = await coll.findOneAndUpdate(
        { domainId, docType, docId },
        { $push: { [key]: v } },
        { returnOriginal: false },
    );
    return [doc.value, _id];
}

export async function pull<K extends keyof DocType, T extends ArrayKeys<DocType[K]>>(
    domainId: string, docType: K, docId: DocType[K]['docId'],
    setKey: T, contents: FilterQuery<DocType[K][T][0]>,
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
    key: K, subId: DocType[T][K][0]['_id'], args: Partial<DocType[T][K][0]>,
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

export async function getStatus<K extends keyof DocStatusType>(
    domainId: string, docType: K, docId: DocStatusType[K]['docId'], uid: number,
): Promise<DocStatusType[K]> {
    return await collStatus.findOne({ domainId, docType, docId, uid });
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
        { domainId, docType, docId, uid },
        { $set: args },
        { upsert: true, returnOriginal: false },
    );
    return res.value;
}

export async function setMultiStatus<K extends keyof DocStatusType>(
    domainId: string, docType: K, query: FilterQuery<DocStatusType[K]>, args: Partial<DocStatusType[K]>,
) {
    return await collStatus.updateMany(
        { domainId, docType, ...query },
        { $set: args },
    );
}

export async function setIfNotStatus<T extends keyof DocStatusType, K extends keyof DocStatusType[T]>(
    domainId: string, docType: T, docId: DocStatusType[T]['docId'], uid: number,
    key: K, value: number, ifNot: DocStatusType[T][K], args: Partial<DocStatusType[T]>,
): Promise<DocStatusType[T]> {
    const res = await collStatus.findOneAndUpdate(
        { domainId, docType, docId, uid, [key]: { $not: { $eq: ifNot } } },
        { $set: { [key]: value, ...args } },
        { upsert: true, returnOriginal: false },
    );
    return res.value;
}

export async function cappedIncStatus<T extends keyof DocStatusType>(
    domainId: string, docType: T, docId: DocStatusType[T]['docId'], uid: number,
    key: NumberKeys<DocStatusType[T]>, value: number, minValue = -1, maxValue = 1,
): Promise<DocStatusType[T]> {
    assert(value !== 0);
    const $not = value > 0 ? { $gte: maxValue } : { $lte: minValue };
    const res = await collStatus.findOneAndUpdate(
        { domainId, docType, docId, uid, [key]: { $not } },
        { $inc: { [key]: value } },
        { upsert: true, returnOriginal: false },
    );
    return res.value;
}

export async function incStatus<T extends keyof DocStatusType>(
    domainId: string, docType: T, docId: DocStatusType[T]['docId'], uid: number,
    key: NumberKeys<DocStatusType[T]>, value: number,
): Promise<DocStatusType[T]> {
    const res = await collStatus.findOneAndUpdate(
        { domainId, docType, docId, uid },
        { $inc: { [key]: value } },
        { upsert: true, returnOriginal: false },
    );
    return res.value;
}

export async function revPushStatus<T extends keyof DocStatusType>(
    domainId: string, docType: T, docId: DocStatusType[T]['docId'], uid: number,
    key: ArrayKeys<DocStatusType[T]>, value: any, id = '_id',
): Promise<DocStatusType[T]> {
    let res = await collStatus.findOneAndUpdate(
        { domainId, docType, docId, uid, [`${key}.${id}`]: value[id] },
        { $set: { [`${key}.$`]: value }, $inc: { rev: 1 } },
        { returnOriginal: false },
    );
    if (!res.value) {
        res = await collStatus.findOneAndUpdate(
            { domainId, docType, docId, uid },
            { $push: { [key]: value }, $inc: { rev: 1 } },
            { upsert: true, returnOriginal: false },
        );
    }
    return res.value;
}

export async function revInitStatus<T extends keyof DocStatusType>(
    domainId: string, docType: T, docId: DocStatusType[T]['docId'], uid: number,
): Promise<DocStatusType[T]> {
    const res = await collStatus.findOneAndUpdate(
        { domainId, docType, docId, uid },
        { $inc: { rev: 1 } },
        { upsert: true, returnOriginal: false },
    );
    return res.value;
}

export async function revSetStatus<T extends keyof DocStatusType>(
    domainId: string, docType: T, docId: DocStatusType[T]['docId'], uid: number,
    rev: number, args: Partial<DocStatusType[T]>,
): Promise<any> {
    const filter = { domainId, docType, docId, uid, rev };
    const update = { $set: args, $inc: { rev: 1 } };
    const res = await collStatus.findOneAndUpdate(filter, update, { returnOriginal: false });
    return res.value;
}

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
    TYPE_TRAINING,
};
