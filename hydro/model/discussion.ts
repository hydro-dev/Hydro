import { ObjectID } from 'mongodb';
import * as problem from './problem';
import * as contest from './contest';
import * as training from './training';
import * as document from './document';
import { PERM } from './builtin';
import { DocumentNotFoundError } from '../error';

export const typeDisplay = {
    [document.TYPE_PROBLEM]: 'problem',
    [document.TYPE_CONTEST]: 'contest',
    [document.TYPE_DISCUSSION_NODE]: 'node',
    [document.TYPE_TRAINING]: 'training',
    [document.TYPE_HOMEWORK]: 'homework',
};

export function add(
    domainId: string, parentType: number, parentId: ObjectID | number | string,
    owner: number, title: string, content: string,
    ip: string | null = null, highlight: boolean = false,
) {
    return document.add(
        domainId, content, owner, document.TYPE_DISCUSSION,
        null, parentType, parentId,
        {
            title,
            ip,
            highlight,
            nReply: 0,
            updateAt: new Date(),
            views: 0,
        },
    );
}

export function get(domainId: string, did: ObjectID) {
    return document.get(domainId, document.TYPE_DISCUSSION, did);
}

export function edit(
    domainId: string, did: ObjectID,
    title: string, content: string, highlight: boolean,
) {
    return document.set(domainId, document.TYPE_DISCUSSION, did, { title, content, highlight });
}

export function del(domainId: string, did: ObjectID) {
    return Promise.all([
        document.deleteOne(domainId, document.TYPE_DISCUSSION, did),
        document.deleteMulti(domainId, document.TYPE_DISCUSSION_REPLY, {
            parentType: document.TYPE_DISCUSSION, parentId: did,
        }),
        document.deleteMultiStatus(domainId, document.TYPE_DISCUSSION, { docId: did }),
    ]);
}

export function count(domainId: string, query: any) {
    return document.count(domainId, document.TYPE_DISCUSSION, query);
}

export function getMulti(domainId: string, query: any = {}) {
    return document.getMulti(domainId, document.TYPE_DISCUSSION, query).sort('updateAt', -1);
}

export async function addReply(
    domainId: string, did: ObjectID, owner: number,
    content: string, ip: string,
) {
    const [drdoc] = await Promise.all([
        document.add(
            domainId, content, owner, document.TYPE_DISCUSSION_REPLY,
            null, document.TYPE_DISCUSSION, did, { ip },
        ),
        document.incAndSet(domainId, document.TYPE_DISCUSSION, did, 'nReply', 1, { updateAt: new Date() }),
    ]);
    return drdoc;
}

export function getReply(domainId: string, drid: ObjectID) {
    return document.get(domainId, document.TYPE_DISCUSSION_REPLY, drid);
}

export async function editReply(domainId: string, drid: ObjectID, content: string) {
    return document.set(domainId, document.TYPE_DISCUSSION_REPLY, drid, { content });
}

export async function delReply(domainId: string, drid: ObjectID) {
    const drdoc = await getReply(domainId, drid);
    if (!drdoc) throw new DocumentNotFoundError(drid);
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

export function getListReply(domainId: string, did: ObjectID) {
    return getMultiReply(domainId, did).toArray();
}

export async function addTailReply(
    domainId: string, drid: ObjectID,
    owner: number, content: string, ip: string,
) {
    let drdoc = await document.get(domainId, document.TYPE_DISCUSSION_REPLY, drid);
    const sid = new ObjectID();
    [drdoc] = await Promise.all([
        document.push(domainId, document.TYPE_DISCUSSION_REPLY, drid, 'reply', content, owner, { ip }),
        document.set(domainId, document.TYPE_DISCUSSION, drdoc.parentId, { updateAt: new Date() }),
    ]);
    return [drdoc, sid];
}

export function getTailReply(domainId: string, drid: ObjectID, drrid: ObjectID) {
    return document.getSub(domainId, document.TYPE_DISCUSSION_REPLY, drid, 'reply', drrid);
}

export function editTailReply(domainId: string, drid: ObjectID, drrid: ObjectID, content: string) {
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

export function addNode(domainId: string, _id: string, category: string, args: any = {}) {
    return document.add(
        domainId, category, 1, document.TYPE_DISCUSSION_NODE,
        _id, null, null, args,
    );
}

export function getNode(domainId: string, _id: string) {
    return document.get(domainId, document.TYPE_DISCUSSION_NODE, _id);
}

export async function getVnode(domainId: string, ddoc: any, handler: any) {
    if (ddoc.parentType === document.TYPE_PROBLEM) {
        const pdoc = await problem.get(domainId, ddoc.parentId);
        if (!pdoc) return null;
        if (pdoc.hidden && handler) handler.checkPerm(PERM.PERM_VIEW_PROBLEM_HIDDEN);
        return { ...pdoc, type: ddoc.parentType, id: ddoc.parentId };
    }
    if (ddoc.parentType === document.TYPE_CONTEST) {
        const tdoc = await contest.get(domainId, ddoc.parentId);
        return { ...tdoc, type: ddoc.parentType, id: ddoc.parentId };
    }
    if (ddoc.parentType === document.TYPE_DISCUSSION_NODE) {
        const ndoc = await getNode(domainId, ddoc.parentId);
        return {
            ...ndoc,
            title: ddoc.parentId,
            type: ddoc.parentType,
            id: ddoc.parentId,
        };
    }
    if (ddoc.parentType === document.TYPE_TRAINING) {
        const tdoc = await training.get(domainId, ddoc.parentId);
        return { ...tdoc, type: ddoc.parentType, id: ddoc.parentId };
    }
    if (ddoc.parentType === document.TYPE_HOMEWORK) {
        const tdoc = await contest.get(domainId, ddoc.parentId, document.TYPE_HOMEWORK);
        return { ...tdoc, type: ddoc.parentType, id: ddoc.parentId };
    }
    return {
        title: 'Missing Node',
        type: 'Unknown',
        id: new ObjectID(),
    };
}

export function getNodes(domainId: string) {
    return document.getMulti(domainId, document.TYPE_DISCUSSION_NODE).toArray();
}

export async function getListVnodes(domainId: string, ddocs: any, handler: any) {
    const tasks = [];
    const res = {};
    function task(ddoc) {
        return getVnode(domainId, ddoc, handler).then((vnode) => {
            if (!res[ddoc.parentType]) res[ddoc.parentType] = {};
            res[ddoc.parentType][ddoc.parentId] = vnode;
        });
    }
    for (const ddoc of ddocs) tasks.push(task(ddoc));
    await Promise.all(tasks);
    return res;
}

global.Hydro.model.discussion = {
    typeDisplay,
    add,
    get,
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
    setStar,
    getStatus,
    addNode,
    getNode,
    getNodes,
    getVnode,
    getListVnodes,
};
