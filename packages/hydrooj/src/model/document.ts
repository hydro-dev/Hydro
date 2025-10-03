import assert from 'assert';
import {
    Filter, FindCursor, ObjectId, OnlyFieldsOfType, PushOperator, UpdateFilter,
} from 'mongodb';
import { Context } from '../context';
import {
    Content, ContestClarificationDoc, ContestPrintDoc, DiscussionDoc,
    DiscussionReplyDoc, ProblemDoc, ProblemStatusDoc,
    Tdoc, TrainingDoc,
} from '../interface';
import bus from '../service/bus';
import db from '../service/db';
import { ArrayKeys, MaybeArray, NumberKeys, Projection } from '../typeutils';
import { buildProjection } from '../utils';

type DocID = ObjectId | string | number;
type NormalArrayKeys<O, P = any> = Exclude<ArrayKeys<O, P>, symbol>;

export const coll = db.collection('document');
export const collStatus = db.collection('document.status');

export const TYPE_PROBLEM = 10 as const;
export const TYPE_PROBLEM_SOLUTION = 11 as const;
export const TYPE_PROBLEM_LIST = 12 as const;
export const TYPE_DISCUSSION_NODE = 20 as const;
export const TYPE_DISCUSSION = 21 as const;
export const TYPE_DISCUSSION_REPLY = 22 as const;
export const TYPE_CONTEST = 30 as const;
export const TYPE_CONTEST_CLARIFICATION = 31 as const;
export const TYPE_CONTEST_PRINT = 32 as const;
export const TYPE_TRAINING = 40 as const;

export interface DocType {
    [TYPE_PROBLEM]: ProblemDoc;
    [TYPE_PROBLEM_SOLUTION]: any;
    [TYPE_PROBLEM_LIST]: any;
    [TYPE_DISCUSSION_NODE]: any;
    [TYPE_DISCUSSION]: DiscussionDoc;
    [TYPE_DISCUSSION_REPLY]: DiscussionReplyDoc;
    [TYPE_CONTEST]: Tdoc;
    [TYPE_CONTEST_PRINT]: ContestPrintDoc;
    [TYPE_CONTEST_CLARIFICATION]: ContestClarificationDoc;
    [TYPE_TRAINING]: TrainingDoc;
}

export interface DocStatusType {
    [TYPE_PROBLEM]: ProblemStatusDoc;
    // FIXME: this need to be typed
    [key: number]: any;
}

export async function add<T extends keyof DocType, K extends DocType[T]['docId']>(
    domainId: string, content: Content, owner: number,
    docType: T, docId: K,
    parentType?: DocType[T]['parentType'], parentId?: DocType[T]['parentId'],
    args?: Partial<DocType[T]>,
): Promise<K>;
export async function add<T extends keyof DocType>(
    domainId: string, content: Content, owner: number,
    docType: T, docId: null,
    parentType?: DocType[T]['parentType'], parentId?: DocType[T]['parentId'],
    args?: Partial<DocType[T]>,
): Promise<ObjectId>;
export async function add(
    domainId: string, content: Content, owner: number,
    docType: number, docId: DocID = null,
    parentType: number | null = null, parentId: DocID = null,
    args: any = {},
) {
    const _id = new ObjectId();
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
    await bus.parallel('document/add', doc);
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
    domainId: string,
    docType: K,
    docId: DocType[K]['docId'],
    $set?: Partial<DocType[K]>,
    $unset?: OnlyFieldsOfType<DocType[K], any, true | '' | 1>,
    $push?: PushOperator<DocType[K]>,
): Promise<DocType[K]> {
    await bus.parallel('document/set', domainId, docType, docId, $set, $unset);
    const update: UpdateFilter<DocType[K]> = {};
    if ($set && Object.keys($set).length) update.$set = $set;
    if ($unset && Object.keys($unset).length) update.$unset = $unset;
    if ($push && Object.keys($push).length) update.$push = $push;
    return await coll.findOneAndUpdate(
        { domainId, docType, docId },
        update,
        { returnDocument: 'after', upsert: true },
    );
}

export function deleteOne<K extends keyof DocType>(
    domainId: string, docType: K, docId: DocType[K]['docId'],
) {
    return Promise.all([
        coll.deleteOne({ domainId, docType, docId }),
        collStatus.deleteMany({ domainId, docType, docId }),
    ]);
}

export function deleteMulti<K extends keyof DocType>(
    domainId: string, docType: K, query?: Filter<DocType[K]>,
) {
    return coll.deleteMany({ ...query, domainId, docType });
}

export function deleteMultiStatus<K extends keyof DocStatusType>(
    domainId: string, docType: K, query?: Filter<DocStatusType[K]>,
) {
    return collStatus.deleteMany({ ...query, domainId, docType });
}

export function getMulti<K extends keyof DocType>(
    domainId: string, docType: K, query?: Filter<DocType[K]>, projection?: Projection<DocType[K]>,
): FindCursor<DocType[K]> {
    let cursor = coll.find({ docType, domainId, ...query });
    if (projection) cursor = cursor.project(buildProjection(projection));
    return cursor;
}

export async function inc<K extends keyof DocType>(
    domainId: string, docType: K, docId: DocType[K]['docId'],
    key: NumberKeys<DocType[K]>, value: number,
) {
    return await coll.findOneAndUpdate(
        { domainId, docType, docId },
        { $inc: { [key]: value } },
        { returnDocument: 'after' },
    );
}

export async function incAndSet<K extends keyof DocType>(
    domainId: string, docType: K, docId: DocType[K]['docId'],
    key: NumberKeys<DocType[K]>, value: number, args: Partial<DocType[K]>,
) {
    return await coll.findOneAndUpdate(
        { domainId, docType, docId },
        { $inc: { [key]: value }, $set: args },
        { returnDocument: 'after' },
    );
}

export function count<K extends keyof DocType>(
    domainId: string, docType: K, query?: Filter<DocType[K]>,
) {
    return coll.countDocuments({ ...query, docType, domainId });
}

export function countStatus<K extends keyof DocStatusType>(
    domainId: string, docType: K, query?: Filter<DocStatusType[K]>,
) {
    return collStatus.countDocuments({ ...query, docType, domainId });
}

export async function push<K extends keyof DocType>(
    domainId: string, docType: K, docId: DocType[K]['docId'],
    key: ArrayKeys<DocType[K]>, value: DocType[K][0],
): Promise<[DocType[K], ObjectId]>;
export async function push<K extends keyof DocType, T extends keyof DocType[K]>(
    domainId: string, docType: K, docId: DocType[K]['docId'],
    key: keyof DocType[K], content: string, owner: number, args?: DocType[K][T][0],
): Promise<[DocType[K], ObjectId]>;
export async function push(
    domainId: string, docType: number, docId: DocID, key: string,
    arg0: any, arg1?: any, arg2?: any,
) {
    const _id = arg2?._id || arg0?._id || new ObjectId();
    const v = arg1
        ? { _id, ...arg2, content: arg0, owner: arg1 }
        : { _id, ...arg0 };
    const doc = await coll.findOneAndUpdate(
        { domainId, docType, docId },
        // @ts-ignore
        { $push: { [key]: v } },
        { returnDocument: 'after' },
    );
    return [doc, _id];
}

export async function pull<K extends keyof DocType, T extends ArrayKeys<DocType[K]>>(
    domainId: string, docType: K, docId: DocType[K]['docId'],
    setKey: T, contents: Filter<DocType[K][T][0]>,
): Promise<DocType[K]> {
    return await coll.findOneAndUpdate(
        { domainId, docType, docId },
        // @ts-ignore
        { $pull: { [setKey]: { $in: contents } } },
        { returnDocument: 'after' },
    );
}

export async function deleteSub<T extends keyof DocType, K extends ArrayKeys<DocType[T]>>(
    domainId: string, docType: T, docId: DocType[T]['docId'],
    key: K, subId: MaybeArray<DocType[T][K][0]['_id']>,
): Promise<DocType[T]> {
    subId = Array.isArray(subId) ? subId : [subId];
    return await coll.findOneAndUpdate(
        { domainId, docType, docId },
        // @ts-ignore
        { $pull: { [key]: { _id: { $in: subId } } } },
        { returnDocument: 'after' },
    );
}

export async function getSub<T extends keyof DocType, K extends ArrayKeys<DocType[T]>>(
    domainId: string, docType: T, docId: DocType[T]['docId'],
    key: K, subId: DocType[T][K][0]['_id'],
): Promise<[DocType[T], DocType[T][K][0]]> {
    const doc = await coll.findOne({
        domainId,
        docType,
        docId,
        [key]: { $elemMatch: { _id: subId } },
    });
    if (!doc) return [null, null];
    for (const sdoc of doc[key] || []) {
        if (sdoc._id.toString() === subId.toString()) return [doc, sdoc];
    }
    return [doc, null];
}

export async function setSub<T extends keyof DocType, K extends NormalArrayKeys<DocType[T]>>(
    domainId: string, docType: T, docId: DocType[T]['docId'],
    key: K, subId: DocType[T][K][0]['_id'], args: Partial<DocType[T][K][0]>,
): Promise<DocType[T]> {
    const $set: Record<string, any> = {};
    for (const k in args) $set[`${key}.$.${k}`] = args[k];
    return await coll.findOneAndUpdate(
        {
            domainId,
            docType,
            docId,
            [key]: { $elemMatch: { _id: subId } },
        },
        { $set },
        { returnDocument: 'after' },
    );
}

export async function addToSet<T extends keyof DocType, K extends ArrayKeys<DocType[T], string>>(
    domainId: string, docType: T, docId: DocType[T]['docId'],
    setKey: K, content: string,
) {
    return await coll.findOneAndUpdate(
        { domainId, docType, docId },
        // @ts-ignore
        { $addToSet: { [setKey]: content } },
        { returnDocument: 'after' },
    );
}

export async function getStatus<K extends keyof DocStatusType>(
    domainId: string, docType: K, docId: DocStatusType[K]['docId'], uid: number,
): Promise<DocStatusType[K]> {
    return await collStatus.findOne({ domainId, docType, docId, uid });
}

export function getMultiStatus<K extends keyof DocStatusType>(
    domainId: string, docType: K, args: Filter<DocStatusType[K]>,
): FindCursor<DocStatusType[K]> {
    return collStatus.find({ ...args, docType, domainId });
}

export function getMultiStatusWithoutDomain<K extends keyof DocStatusType>(
    docType: K, args: Filter<DocStatusType[K]>,
): FindCursor<DocStatusType[K]> {
    return collStatus.find({ ...args, docType });
}

export async function setStatus<K extends keyof DocStatusType>(
    domainId: string, docType: K, docId: DocStatusType[K]['docId'], uid: number,
    args: UpdateFilter<DocStatusType[K]>['$set'], returnDocument: 'before' | 'after' = 'after',
): Promise<DocStatusType[K]> {
    return await collStatus.findOneAndUpdate(
        { domainId, docType, docId, uid },
        { $set: args },
        {
            upsert: true,
            returnDocument,
            // if fetching document before update we want to ensure data was read from primary
            ...(returnDocument === 'before' ? { readConcern: { level: 'majority' }, readPreference: 'primary' } : {}),
        },
    );
}

export async function setMultiStatus<K extends keyof DocStatusType>(
    domainId: string, docType: K, query: Filter<DocStatusType[K]>, args: Partial<DocStatusType[K]>,
) {
    return await collStatus.updateMany(
        { domainId, docType, ...query },
        { $set: args },
    );
}

export async function setStatusIfCondition<T extends keyof DocStatusType>(
    domainId: string, docType: T, docId: DocStatusType[T]['docId'], uid: number,
    filter: Filter<DocStatusType[T]>, args: Partial<DocStatusType[T]> = {},
    returnDocument: 'before' | 'after' = 'after',
): Promise<DocStatusType[T]> {
    try {
        return await collStatus.findOneAndUpdate(
            { domainId, docType, docId, uid, ...filter },
            { $set: args },
            { upsert: true, returnDocument },
        );
    } catch (e) {
        return false;
    }
}

export async function setIfNotStatus<T extends keyof DocStatusType, K extends keyof DocStatusType[T]>(
    domainId: string, docType: T, docId: DocStatusType[T]['docId'], uid: number,
    key: K, value: DocStatusType[T][K], ifNot: DocStatusType[T][K], args: Partial<DocStatusType[T]>,
    returnDocument: 'before' | 'after' = 'after',
): Promise<DocStatusType[T]> {
    return await setStatusIfCondition(
        domainId, docType, docId, uid, { [key]: { $ne: ifNot } } as any,
        { [key]: value, ...args }, returnDocument,
    );
}

export async function cappedIncStatus<T extends keyof DocStatusType>(
    domainId: string, docType: T, docId: DocStatusType[T]['docId'], uid: number,
    key: NumberKeys<DocStatusType[T]>, value: number, minValue = -1, maxValue = 1,
    setPayload: Partial<DocStatusType[T]> = {},
): Promise<DocStatusType[T]> {
    assert(value !== 0);
    const $not = value > 0 ? { $gte: maxValue } : { $lte: minValue };
    const operation = { $inc: { [key]: value } } as UpdateFilter<DocStatusType[T]>;
    if (Object.keys(setPayload).length) operation.$set = setPayload;
    return await collStatus.findOneAndUpdate(
        { domainId, docType, docId, uid, [key]: { $not } },
        operation,
        { upsert: true, returnDocument: 'after' },
    );
}

export async function incStatus<T extends keyof DocStatusType>(
    domainId: string, docType: T, docId: DocStatusType[T]['docId'], uid: number,
    key: NumberKeys<DocStatusType[T]>, value: number,
): Promise<DocStatusType[T]> {
    return await collStatus.findOneAndUpdate(
        { domainId, docType, docId, uid },
        { $inc: { [key]: value } },
        { upsert: true, returnDocument: 'after' },
    );
}

export async function revPushStatus<T extends keyof DocStatusType>(
    domainId: string, docType: T, docId: DocStatusType[T]['docId'], uid: number,
    key: NormalArrayKeys<DocStatusType[T]>, value: any, id = '_id',
): Promise<DocStatusType[T]> {
    let res = await collStatus.findOneAndUpdate(
        { domainId, docType, docId, uid, [`${key}.${id}`]: value[id] },
        { $set: { [`${key}.$`]: value }, $inc: { rev: 1 } },
        { returnDocument: 'after' },
    );
    res ||= await collStatus.findOneAndUpdate(
        { domainId, docType, docId, uid },
        // @ts-ignore
        { $push: { [key]: value }, $inc: { rev: 1 } },
        { upsert: true, returnDocument: 'after' },
    );
    return res;
}

export async function revInitStatus<T extends keyof DocStatusType>(
    domainId: string, docType: T, docId: DocStatusType[T]['docId'], uid: number,
): Promise<DocStatusType[T]> {
    return await collStatus.findOneAndUpdate(
        { domainId, docType, docId, uid },
        { $inc: { rev: 1 } },
        { upsert: true, returnDocument: 'after' },
    );
}

export async function revSetStatus<T extends keyof DocStatusType>(
    domainId: string, docType: T, docId: DocStatusType[T]['docId'], uid: number,
    rev: number, args: Partial<DocStatusType[T]>,
): Promise<any> {
    const filter = { domainId, docType, docId, uid, rev };
    const update = { $set: args, $inc: { rev: 1 } };
    return await collStatus.findOneAndUpdate(filter, update, { returnDocument: 'after' });
}

export async function apply(ctx: Context) {
    ctx.on('domain/delete', (domainId) => Promise.all([
        coll.deleteMany({ domainId }),
        collStatus.deleteMany({ domainId }),
    ]));
    await db.clearIndexes(coll, ['tag', 'hidden']);
    const onlyFor = (docType: number) => ({ partialFilterExpression: { docType } });
    await db.ensureIndexes(
        coll,
        { key: { domainId: 1, docType: 1, docId: 1 }, name: 'basic', unique: true },
        { key: { domainId: 1, docType: 1, owner: 1, docId: -1 }, name: 'owner' },
        // For problem
        { key: { domainId: 1, docType: 1, search: 'text', title: 'text' }, name: 'search', sparse: true },
        { key: { domainId: 1, docType: 1, sort: 1, docId: 1 }, name: 'sort' },
        // For problem solution
        { key: { domainId: 1, docType: 1, parentType: 1, parentId: 1, vote: -1, docId: -1 }, name: 'solution', sparse: true },
        // For discussion
        { key: { docType: 1, domainId: 1, hidden: 1, pin: -1, docId: -1 }, name: 'discussionSort', ...onlyFor(TYPE_DISCUSSION) },
        { key: { docType: 1, domainId: 1, hidden: 1, parentType: 1, parentId: 1, pin: -1, docId: -1 }, name: 'discussionNodeSort', sparse: true },
        // Hidden doc
        { key: { domainId: 1, docType: 1, hidden: 1, docId: -1 }, name: 'hiddenDoc', sparse: true },
        // For contest
        { key: { domainId: 1, docType: 1, pids: 1 }, name: 'contest', sparse: true },
        { key: { domainId: 1, docType: 1, rule: 1, docId: -1 }, name: 'contestRule', sparse: true },
        // For training
        { key: { domainId: 1, docType: 1, 'dag.pids': 1 }, name: 'training', sparse: true },
    );
    await db.ensureIndexes(
        collStatus,
        { key: { domainId: 1, docType: 1, docId: 1, uid: 1 }, name: 'basic', unique: true },
        { key: { domainId: 1, docType: 1, docId: 1, status: 1, rid: 1, rp: 1 }, name: 'rp', sparse: true },
        { key: { domainId: 1, docType: 1, docId: 1, score: -1 }, name: 'contestRuleOI', sparse: true },
        { key: { domainId: 1, docType: 1, docId: 1, accept: -1, time: 1 }, name: 'contestRuleACM', sparse: true },
        { key: { domainId: 1, docType: 1, uid: 1, enroll: 1, docId: 1 }, name: 'training', sparse: true },
    );
}

global.Hydro.model.document = {
    coll,
    collStatus,

    add,
    addToSet,
    cappedIncStatus,
    count,
    countStatus,
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
    setStatusIfCondition,
    setStatus,
    setMultiStatus,
    setSub,

    TYPE_CONTEST,
    TYPE_CONTEST_CLARIFICATION,
    TYPE_CONTEST_PRINT,
    TYPE_DISCUSSION,
    TYPE_DISCUSSION_NODE,
    TYPE_DISCUSSION_REPLY,
    TYPE_PROBLEM,
    TYPE_PROBLEM_LIST,
    TYPE_PROBLEM_SOLUTION,
    TYPE_TRAINING,
};
