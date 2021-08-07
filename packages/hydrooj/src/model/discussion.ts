import { FilterQuery, ObjectID } from 'mongodb';
import { omit } from 'lodash';
import moment from 'moment';
import problem from './problem';
import * as contest from './contest';
import * as training from './training';
import * as document from './document';
import TaskModel from './task';
import { DiscussionNodeNotFoundError, DocumentNotFoundError } from '../error';
import { DiscussionReplyDoc, DiscussionTailReplyDoc, Document } from '../interface';
import { buildProjection } from '../utils';
import { NumberKeys } from '../typeutils';
import * as bus from '../service/bus';

export interface DiscussionDoc extends Document { }
export namespace DiscussionDoc {
    export type Field = keyof DiscussionDoc;
    export const fields: Field[] = [];
    type Getter = () => Partial<DiscussionDoc>;
    const getters: Getter[] = [];
    export function extend(getter: Getter) {
        getters.push(getter);
        fields.push(...Object.keys(getter()) as any);
    }

    extend(() => ({
        _id: new ObjectID(),
        domainId: 'system',
        docType: document.TYPE_DISCUSSION,
        docId: new ObjectID(),
        owner: 1,
        title: '*',
        content: '',
        parentId: new ObjectID(),
        ip: '1.1.1.1',
        pin: false,
        highlight: false,
        updateAt: new Date(),
        nReply: 0,
        views: 0,
        history: [],
    }));

    export function create() {
        const result = {} as DiscussionDoc;
        for (const getter of getters) {
            Object.assign(result, getter());
        }
        return result;
    }
}

export const PROJECTION_LIST: DiscussionDoc.Field[] = [
    '_id', 'domainId', 'docType', 'docId', 'highlight',
    'nReply', 'views', 'pin', 'updateAt', 'owner',
    'parentId', 'parentType', 'title',
];
export const PROJECTION_PUBLIC: DiscussionDoc.Field[] = [
    ...PROJECTION_LIST, 'content', 'history',
];

export const typeDisplay = {
    [document.TYPE_PROBLEM]: 'problem',
    [document.TYPE_CONTEST]: 'contest',
    [document.TYPE_DISCUSSION_NODE]: 'node',
    [document.TYPE_TRAINING]: 'training',
    [document.TYPE_HOMEWORK]: 'homework',
};

export async function add(
    domainId: string, parentType: number, parentId: ObjectID | number | string,
    owner: number, title: string, content: string,
    ip: string | null = null, highlight: boolean, pin: boolean,
): Promise<ObjectID> {
    const payload: Partial<DiscussionDoc> = {
        domainId,
        content,
        owner,
        parentType,
        parentId,
        title,
        ip,
        nReply: 0,
        highlight,
        pin,
        updateAt: new Date(),
        views: 0,
        sort: 100,
    };
    await bus.serial('discussion/before-add', payload);
    const res = await document.add(
        payload.domainId, payload.content, payload.owner, document.TYPE_DISCUSSION,
        null, payload.parentType, payload.parentId, omit(payload, ['domainId', 'content', 'owner', 'parentType', 'parentId']),
    );
    payload.docId = res;
    await bus.emit('discussion/add', payload);
    return payload.docId;
}

export async function get<T extends DiscussionDoc.Field>(
    domainId: string, did: ObjectID, projection: T[] = PROJECTION_PUBLIC as any,
): Promise<Pick<DiscussionDoc, T>> {
    return await document.get(domainId, document.TYPE_DISCUSSION, did, projection);
}

export function edit(
    domainId: string, did: ObjectID,
    title: string, content: string, highlight: boolean, pin: boolean,
): Promise<DiscussionDoc | null> {
    const payload = {
        title, content, highlight, pin,
    };
    return document.set(domainId, document.TYPE_DISCUSSION, did, payload);
}

export function inc(
    domainId: string, did: ObjectID, key: NumberKeys<DiscussionDoc>, value: number,
): Promise<DiscussionDoc | null> {
    return document.inc(domainId, document.TYPE_DISCUSSION, did, key, value);
}

export function del(domainId: string, did: ObjectID): Promise<never> {
    return Promise.all([
        document.deleteOne(domainId, document.TYPE_DISCUSSION, did),
        document.deleteMulti(domainId, document.TYPE_DISCUSSION_REPLY, {
            parentType: document.TYPE_DISCUSSION, parentId: did,
        }),
        document.deleteMultiStatus(domainId, document.TYPE_DISCUSSION, { docId: did }),
    ]) as any;
}

export function count(domainId: string, query: FilterQuery<DiscussionDoc>) {
    return document.count(domainId, document.TYPE_DISCUSSION, query);
}

export function getMulti(domainId: string, query: FilterQuery<DiscussionDoc> = {}, projection = PROJECTION_LIST) {
    return document.getMulti(domainId, document.TYPE_DISCUSSION, query)
        .sort({ pin: -1, sort: -1 })
        .project(buildProjection(projection));
}

export async function addReply(
    domainId: string, did: ObjectID, owner: number,
    content: string, ip: string,
): Promise<ObjectID> {
    const [drid] = await Promise.all([
        document.add(
            domainId, content, owner, document.TYPE_DISCUSSION_REPLY,
            null, document.TYPE_DISCUSSION, did, { ip },
        ),
        document.incAndSet(domainId, document.TYPE_DISCUSSION, did, 'nReply', 1, { updateAt: new Date() }),
    ]);
    return drid;
}

export function getReply(domainId: string, drid: ObjectID): Promise<DiscussionReplyDoc | null> {
    return document.get(domainId, document.TYPE_DISCUSSION_REPLY, drid);
}

export async function editReply(
    domainId: string, drid: ObjectID, content: string,
): Promise<DiscussionReplyDoc | null> {
    return document.set(domainId, document.TYPE_DISCUSSION_REPLY, drid, { content });
}

export async function delReply(domainId: string, drid: ObjectID) {
    const drdoc = await getReply(domainId, drid);
    if (!drdoc) throw new DocumentNotFoundError(domainId, drid);
    return await Promise.all([
        document.deleteOne(domainId, document.TYPE_DISCUSSION_REPLY, drid),
        document.inc(domainId, document.TYPE_DISCUSSION, drdoc.parentId, 'nReply', -1),
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
    const updated = await document.setIfNotStatus(domainId, docType, did, uid, `react.${id}`, reverse ? 0 : 1, reverse ? 0 : 1, {});
    if (updated) await document.inc(domainId, docType, did, `react.${id}`, reverse ? -1 : 1);
}

export async function addTailReply(
    domainId: string, drid: ObjectID,
    owner: number, content: string, ip: string,
): Promise<[DiscussionReplyDoc, ObjectID]> {
    const [drdoc, subId] = await document.push(
        domainId, document.TYPE_DISCUSSION_REPLY, drid,
        'reply', content, owner, { ip },
    );
    await document.set(
        domainId, document.TYPE_DISCUSSION, drdoc.parentId,
        { updateAt: new Date() },
    );
    return [drdoc, subId];
}

export function getTailReply(
    domainId: string, drid: ObjectID, drrid: ObjectID,
): Promise<[DiscussionReplyDoc, DiscussionTailReplyDoc] | [null, null]> {
    // @ts-ignore
    return document.getSub(domainId, document.TYPE_DISCUSSION_REPLY, drid, 'reply', drrid);
}

export function editTailReply(
    domainId: string, drid: ObjectID, drrid: ObjectID, content: string,
): Promise<DiscussionTailReplyDoc> {
    return document.setSub(domainId, document.TYPE_DISCUSSION_REPLY, drid, 'reply', drrid, { content });
}

export async function delTailReply(domainId: string, drid: ObjectID, drrid: ObjectID) {
    return document.deleteSub(domainId, document.TYPE_DISCUSSION_REPLY, drid, 'reply', drrid);
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

export async function getVnode(domainId: string, type: number, id: string, uid?: number) {
    if (type === document.TYPE_PROBLEM) {
        const pdoc = await problem.get(domainId, Number.isSafeInteger(+id) ? +id : id);
        if (!pdoc) throw new DiscussionNodeNotFoundError(id);
        return { ...pdoc, type, id };
    }
    if ([document.TYPE_CONTEST, document.TYPE_TRAINING, document.TYPE_HOMEWORK].includes(type as any)) {
        const model = type === document.TYPE_TRAINING ? training : contest;
        const _id = new ObjectID(id);
        const tdoc = await model.get(domainId, _id, type as any);
        if (!tdoc) throw new DiscussionNodeNotFoundError(id);
        if (uid) {
            const tsdoc = await model.getStatus(domainId, _id, uid);
            tdoc.attend = tsdoc?.attend || tsdoc?.enroll;
        }
        return { ...tdoc, type, id };
    }
    return {
        ...await getNode(domainId, id),
        title: id,
        type,
        id,
    };
}

export function getNodes(domainId: string) {
    return document.getMulti(domainId, document.TYPE_DISCUSSION_NODE).toArray();
}

export async function getListVnodes(domainId: string, ddocs: any, getHidden: boolean) {
    const tasks = [];
    const res = {};
    async function task(ddoc: DiscussionDoc) {
        const vnode = await getVnode(domainId, ddoc.parentType, ddoc.parentId.toString());
        if (!res[ddoc.parentType]) res[ddoc.parentType] = {};
        if (vnode.hidden && !getHidden) return;
        res[ddoc.parentType][ddoc.parentId] = vnode;
    }
    for (const ddoc of ddocs) tasks.push(task(ddoc));
    await Promise.all(tasks);
    return res;
}

bus.on('problem/delete', async (domainId, docId) => {
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

const t = Math.exp(-0.15);

async function updateSort() {
    const cursor = document.coll.find({ docType: document.TYPE_DISCUSSION });
    // eslint-disable-next-line no-await-in-loop
    while (await cursor.hasNext()) {
        // eslint-disable-next-line no-await-in-loop
        const data = await cursor.next();
        // eslint-disable-next-line no-await-in-loop
        const rCount = await getMultiReply(data.domainId, data.docId).count();
        const sort = ((data.sort || 100) + Math.max(rCount - (data.lastRCount || 0), 0) * 10) * t;
        // eslint-disable-next-line no-await-in-loop
        await document.coll.updateOne({ _id: data._id }, { $set: { sort, lastRCount: rCount } });
    }
}
TaskModel.Worker.addHandler('discussion.sort', updateSort);

bus.once('app/started', async () => {
    if (!await TaskModel.count({ type: 'schedule', subType: 'discussion.sort' })) {
        await TaskModel.add({
            type: 'schedule',
            subType: 'discussion.sort',
            executeAfter: moment().minute(0).second(0).millisecond(0).toDate(),
            interval: [1, 'hour'],
        });
    }
});

global.Hydro.model.discussion = {
    typeDisplay,
    DiscussionDoc,
    PROJECTION_LIST,
    PROJECTION_PUBLIC,

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
    setStar,
    getStatus,
    setStatus,
    addNode,
    getNode,
    getNodes,
    getVnode,
    getListVnodes,
};
