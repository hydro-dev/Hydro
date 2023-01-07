import { omit } from 'lodash';
import { FilterQuery, ObjectID } from 'mongodb';
import { Context } from '../context';
import { DiscussionNodeNotFoundError, DocumentNotFoundError } from '../error';
import {
    DiscussionHistoryDoc, DiscussionReplyDoc, DiscussionTailReplyDoc, Document,
} from '../interface';
import * as bus from '../service/bus';
import db from '../service/db';
import { NumberKeys } from '../typeutils';
import { buildProjection } from '../utils';
import * as contest from './contest';
import * as document from './document';
import problem from './problem';
import * as training from './training';

export interface DiscussionDoc extends Document { }
export type Field = keyof DiscussionDoc;

export const PROJECTION_LIST: Field[] = [
    '_id', 'domainId', 'docType', 'docId', 'highlight',
    'nReply', 'views', 'pin', 'updateAt', 'owner',
    'parentId', 'parentType', 'title',
];
export const PROJECTION_PUBLIC: Field[] = [
    ...PROJECTION_LIST, 'content', 'edited', 'react', 'maintainer',
    'lock',
];
export const HISTORY_PROJECTION_PUBLIC: (keyof DiscussionHistoryDoc)[] = [
    'title', 'content', 'docId', 'uid', 'time',
];

export const typeDisplay = {
    [document.TYPE_PROBLEM]: 'problem',
    [document.TYPE_CONTEST]: 'contest',
    [document.TYPE_DISCUSSION_NODE]: 'node',
    [document.TYPE_TRAINING]: 'training',
    [document.TYPE_HOMEWORK]: 'homework',
};

export const coll = db.collection('discussion.history');

export async function add(
    domainId: string, parentType: number, parentId: ObjectID | number | string,
    owner: number, title: string, content: string,
    ip: string | null = null, highlight: boolean, pin: boolean,
): Promise<ObjectID> {
    const time = new Date();
    const payload: Partial<DiscussionDoc> = {
        domainId,
        content,
        owner,
        editor: owner,
        parentType,
        parentId,
        title,
        ip,
        nReply: 0,
        highlight,
        pin,
        updateAt: time,
        views: 0,
        sort: 100,
    };
    await bus.parallel('discussion/before-add', payload);
    const res = await document.add(
        payload.domainId!, payload.content!, payload.owner!, document.TYPE_DISCUSSION,
        null, payload.parentType, payload.parentId, omit(payload, ['domainId', 'content', 'owner', 'parentType', 'parentId']),
    );
    await coll.insertOne({
        domainId, docId: res, content, uid: owner, ip, time: new Date(),
    });
    payload.docId = res;
    await bus.parallel('discussion/add', payload);
    return payload.docId;
}

export async function get<T extends Field>(
    domainId: string, did: ObjectID, projection: T[] = PROJECTION_PUBLIC as any,
): Promise<Pick<DiscussionDoc, T>> {
    return await document.get(domainId, document.TYPE_DISCUSSION, did, projection);
}

export async function edit(domainId: string, did: ObjectID, $set: Partial<DiscussionDoc>) {
    await coll.insertOne({
        domainId, docId: did, content: $set.content, uid: $set.editor, ip: $set.ip, time: new Date(),
    });
    return document.set(domainId, document.TYPE_DISCUSSION, did, $set);
}

export function inc(
    domainId: string, did: ObjectID, key: NumberKeys<DiscussionDoc>, value: number,
): Promise<DiscussionDoc | null> {
    return document.inc(domainId, document.TYPE_DISCUSSION, did, key, value);
}

export async function del(domainId: string, did: ObjectID): Promise<void> {
    const [ddoc, drdocs] = await Promise.all([
        document.get(domainId, document.TYPE_DISCUSSION, did),
        document.getMulti(domainId, document.TYPE_DISCUSSION_REPLY, {
            parentType: document.TYPE_DISCUSSION, parentId: did,
        }).project({ _id: 1, 'reply._id': 1 }).toArray(),
    ]) as any;
    await Promise.all([
        document.deleteOne(domainId, document.TYPE_DISCUSSION, did),
        document.deleteMulti(domainId, document.TYPE_DISCUSSION_REPLY, {
            parentType: document.TYPE_DISCUSSION, parentId: did,
        }),
        document.deleteMultiStatus(domainId, document.TYPE_DISCUSSION, { docId: did }),
        coll.deleteMany({ domainId, docId: { $in: [ddoc._id, ...(drdocs.reply?.map((i) => i._id) || [])] } }),
    ]) as any;
}

export function count(domainId: string, query: FilterQuery<DiscussionDoc>) {
    return document.count(domainId, document.TYPE_DISCUSSION, query);
}

export function getMulti(domainId: string, query: FilterQuery<DiscussionDoc> = {}, projection = PROJECTION_LIST) {
    return document.getMulti(domainId, document.TYPE_DISCUSSION, query)
        .sort({ pin: -1, docId: -1 })
        .project(buildProjection(projection));
}

export async function addReply(
    domainId: string, did: ObjectID, owner: number,
    content: string, ip: string,
): Promise<ObjectID> {
    const time = new Date();
    const [drid] = await Promise.all([
        document.add(
            domainId, content, owner, document.TYPE_DISCUSSION_REPLY,
            null, document.TYPE_DISCUSSION, did, { ip, editor: owner },
        ),
        document.incAndSet(domainId, document.TYPE_DISCUSSION, did, 'nReply', 1, { updateAt: time }),
    ]);
    await coll.insertOne({
        domainId, docId: drid, content, uid: owner, ip, time,
    });
    return drid;
}

export function getReply(domainId: string, drid: ObjectID): Promise<DiscussionReplyDoc | null> {
    return document.get(domainId, document.TYPE_DISCUSSION_REPLY, drid);
}

export async function editReply(
    domainId: string, drid: ObjectID, content: string, uid: number, ip: string,
): Promise<DiscussionReplyDoc | null> {
    await coll.insertOne({
        domainId, docId: drid, content, uid, ip, time: new Date(),
    });
    return document.set(domainId, document.TYPE_DISCUSSION_REPLY, drid, { content, edited: true, editor: uid });
}

export async function delReply(domainId: string, drid: ObjectID) {
    const drdoc = await getReply(domainId, drid);
    if (!drdoc) throw new DocumentNotFoundError(domainId, drid);
    return await Promise.all([
        document.deleteOne(domainId, document.TYPE_DISCUSSION_REPLY, drid),
        document.inc(domainId, document.TYPE_DISCUSSION, drdoc.parentId, 'nReply', -1),
        coll.deleteMany({ domainId, docId: { $in: [drid, ...(drdoc.reply?.map((i) => i._id) || [])] } }),
    ]);
}

export function getMultiReply(domainId: string, did: ObjectID) {
    return document.getMulti(
        domainId, document.TYPE_DISCUSSION_REPLY,
        { parentType: document.TYPE_DISCUSSION, parentId: did },
    ).sort('_id', -1);
}

export function getListReply(domainId: string, did: ObjectID): Promise<DiscussionReplyDoc[]> {
    return getMultiReply(domainId, did).toArray();
}

export async function react(domainId: string, docType: keyof document.DocType, did: ObjectID, id: string, uid: number, reverse = false) {
    let doc;
    const sdoc = await document.setIfNotStatus(domainId, docType, did, uid, `react.${id}`, reverse ? 0 : 1, reverse ? 0 : 1, {});
    if (sdoc) doc = await document.inc(domainId, docType, did, `react.${id}`, reverse ? -1 : 1);
    else doc = await document.get(domainId, docType, did, ['react']);
    return [doc, sdoc];
}

export async function getReaction(domainId: string, docType: keyof document.DocType, did: ObjectID, uid: number) {
    const doc = await document.getStatus(domainId, docType, did, uid);
    return doc?.react || {};
}

export async function addTailReply(
    domainId: string, drid: ObjectID,
    owner: number, content: string, ip: string,
): Promise<[DiscussionReplyDoc, ObjectID]> {
    const time = new Date();
    const [drdoc, subId] = await document.push(
        domainId, document.TYPE_DISCUSSION_REPLY, drid,
        'reply', content, owner, { ip, editor: owner },
    );
    await Promise.all([
        coll.insertOne({
            domainId, docId: subId, content, uid: owner, ip, time: new Date(),
        }),
        document.set(
            domainId, document.TYPE_DISCUSSION, drdoc.parentId,
            { updateAt: time },
        ),
    ]);
    return [drdoc, subId];
}

export function getTailReply(
    domainId: string, drid: ObjectID, drrid: ObjectID,
): Promise<[DiscussionReplyDoc, DiscussionTailReplyDoc] | [null, null]> {
    return document.getSub(domainId, document.TYPE_DISCUSSION_REPLY, drid, 'reply', drrid);
}

export async function editTailReply(
    domainId: string, drid: ObjectID, drrid: ObjectID, content: string, uid: number, ip: string,
): Promise<DiscussionTailReplyDoc> {
    const [, drrdoc] = await Promise.all([
        coll.insertOne({
            domainId, docId: drrid, content, uid, time: new Date(), ip,
        }),
        document.setSub(domainId, document.TYPE_DISCUSSION_REPLY, drid,
            'reply', drrid, { content, edited: true, editor: uid }),
    ]);
    return drrdoc;
}

export async function delTailReply(domainId: string, drid: ObjectID, drrid: ObjectID) {
    return Promise.all([
        document.deleteSub(domainId, document.TYPE_DISCUSSION_REPLY, drid, 'reply', drrid),
        coll.deleteMany({ domainId, docId: drrid }),
    ]);
}

export function getHistory(
    domainId: string, docId: ObjectID, query: FilterQuery<DiscussionHistoryDoc> = {},
    projection = HISTORY_PROJECTION_PUBLIC,
) {
    return coll.find({ domainId, docId, ...query })
        .sort({ time: -1 }).project(buildProjection(projection))
        .toArray();
}

export function setStar(domainId: string, did: ObjectID, uid: number, star: boolean) {
    return document.setStatus(domainId, document.TYPE_DISCUSSION, did, uid, { star });
}

export function getStatus(domainId: string, did: ObjectID, uid: number) {
    return document.getStatus(domainId, document.TYPE_DISCUSSION, did, uid);
}

export function setStatus(domainId: string, did: ObjectID, uid: number, $set) {
    return document.setStatus(domainId, document.TYPE_DISCUSSION, did, uid, $set);
}

export function addNode(domainId: string, _id: string, category: string, args: any = {}) {
    return document.add(
        domainId, category, 1, document.TYPE_DISCUSSION_NODE,
        _id, null, null, args,
    );
}

export function getNode(domainId: string, _id: string) {
    return document.get(domainId, document.TYPE_DISCUSSION_NODE, _id);
}

export function flushNodes(domainId: string) {
    return document.deleteMulti(domainId, document.TYPE_DISCUSSION_NODE);
}

export async function getVnode(domainId: string, type: number, id: string, uid?: number) {
    if (type === document.TYPE_PROBLEM) {
        let pdoc = await problem.get(domainId, Number.isSafeInteger(+id) ? +id : id, problem.PROJECTION_LIST);
        if (!pdoc) throw new DiscussionNodeNotFoundError(id);
        if (pdoc.hidden) pdoc = problem.default;
        return { ...pdoc, type, id: pdoc.docId };
    }
    if ([document.TYPE_CONTEST, document.TYPE_TRAINING, document.TYPE_HOMEWORK].includes(type as any)) {
        const model = type === document.TYPE_TRAINING ? training : contest;
        const _id = new ObjectID(id);
        const tdoc = await model.get(domainId, _id);
        if (!tdoc) throw new DiscussionNodeNotFoundError(id);
        if (uid) {
            const tsdoc = await model.getStatus(domainId, _id, uid);
            tdoc.attend = tsdoc?.attend || tsdoc?.enroll;
        }
        return { ...tdoc, type, id: _id };
    }
    return {
        title: id,
        ...await getNode(domainId, id),
        type,
        id,
    };
}

export function getNodes(domainId: string) {
    return document.getMulti(domainId, document.TYPE_DISCUSSION_NODE).toArray();
}

export async function getListVnodes(domainId: string, ddocs: any, getHidden = false, assign: string[] = []) {
    const res = {};
    async function task(ddoc: DiscussionDoc) {
        const vnode = await getVnode(domainId, ddoc.parentType, ddoc.parentId.toString());
        res[ddoc.parentType] ||= {};
        if (!getHidden && vnode.hidden) return;
        if (vnode.assign?.length && Set.intersection(vnode.assign, assign).size) return;
        res[ddoc.parentType][ddoc.parentId] = vnode;
    }
    await Promise.all(ddocs.map((ddoc) => task(ddoc)));
    return res;
}

export function apply(ctx: Context) {
    ctx.on('problem/delete', async (domainId, docId) => {
        const dids = await document.getMulti(
            domainId, document.TYPE_DISCUSSION,
            { parentType: document.TYPE_PROBLEM, parentId: docId },
        ).project({ docId: 1 }).map((ddoc) => ddoc.docId).toArray();
        const drids = await document.getMulti(
            domainId, document.TYPE_DISCUSSION_REPLY,
            { parentType: document.TYPE_DISCUSSION, parentId: { $in: dids } },
        ).project({ docId: 1 }).map((drdoc) => drdoc.docId).toArray();
        return await Promise.all([
            document.deleteMultiStatus(domainId, document.TYPE_DISCUSSION, { docId: { $in: dids } }),
            document.deleteMulti(domainId, document.TYPE_DISCUSSION, { docId: { $in: dids } }),
            document.deleteMulti(domainId, document.TYPE_DISCUSSION_REPLY, { docId: { $in: drids } }),
        ]);
    });
}

global.Hydro.model.discussion = {
    coll,
    typeDisplay,
    PROJECTION_LIST,
    PROJECTION_PUBLIC,
    HISTORY_PROJECTION_PUBLIC,

    apply,
    add,
    get,
    inc,
    edit,
    del,
    count,
    getMulti,
    addReply,
    getReply,
    editReply,
    delReply,
    getMultiReply,
    getListReply,
    addTailReply,
    getTailReply,
    editTailReply,
    delTailReply,
    react,
    getReaction,
    getHistory,
    setStar,
    getStatus,
    setStatus,
    addNode,
    getNode,
    flushNodes,
    getNodes,
    getVnode,
    getListVnodes,
};
