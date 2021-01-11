import { ObjectID } from 'mongodb';
import * as document from './document';
import { SolutionNotFoundError } from '../error';
import * as bus from '../service/bus';

export function add(domainId: string, pid: number, owner: number, content: string) {
    return document.add(
        domainId, content, owner, document.TYPE_PROBLEM_SOLUTION,
        null, document.TYPE_PROBLEM, pid, { reply: [], vote: 0 },
    );
}

export async function get(domainId: string, psid: ObjectID) {
    const psdoc = await document.get(domainId, document.TYPE_PROBLEM_SOLUTION, psid);
    if (!psdoc) throw new SolutionNotFoundError();
    return psdoc;
}

export function getMany(domainId: string, query: any, sort: any, page: number, limit: number) {
    return document.getMulti(domainId, document.TYPE_PROBLEM_SOLUTION, query)
        .sort(sort)
        .skip((page - 1) * limit).limit(limit)
        .toArray();
}

export function edit(domainId: string, psid: ObjectID, content: string) {
    return document.set(domainId, document.TYPE_PROBLEM_SOLUTION, psid, { content });
}

export async function del(domainId: string, psid: ObjectID) {
    return await Promise.all([
        document.deleteOne(domainId, document.TYPE_PROBLEM_SOLUTION, psid),
        document.deleteMultiStatus(domainId, document.TYPE_PROBLEM_SOLUTION, { docId: psid }),
    ]);
}

export function count(domainId: string, query: any) {
    return document.count(domainId, document.TYPE_PROBLEM_SOLUTION, query);
}

export function getMulti(domainId: string, pid: number) {
    return document.getMulti(
        domainId, document.TYPE_PROBLEM_SOLUTION,
        { parentType: document.TYPE_PROBLEM, parentId: pid },
    ).sort({ vote: -1 });
}

export function reply(domainId: string, psid: ObjectID, owner: number, content: string) {
    return document.push(domainId, document.TYPE_PROBLEM_SOLUTION, psid, 'reply', content, owner);
}

export function getReply(domainId: string, psid: ObjectID, psrid: ObjectID) {
    return document.getSub(domainId, document.TYPE_PROBLEM_SOLUTION, psid, 'reply', psrid);
}

export function editReply(domainId: string, psid: ObjectID, psrid: ObjectID, content: string) {
    return document.setSub(domainId, document.TYPE_PROBLEM_SOLUTION, psid, 'reply', psrid, { content });
}

export function delReply(domainId: string, psid: ObjectID, psrid: ObjectID) {
    return document.deleteSub(domainId, document.TYPE_PROBLEM_SOLUTION, psid, 'reply', psrid);
}

export async function vote(domainId: string, psid: ObjectID, uid: number, value: number) {
    let pssdoc = await document.getStatus(domainId, document.TYPE_PROBLEM_SOLUTION, psid, uid);
    await document.setStatus(domainId, document.TYPE_PROBLEM_SOLUTION, psid, uid, { vote: value });
    if (pssdoc) value += -pssdoc.vote;
    const psdoc = await document.inc(domainId, document.TYPE_PROBLEM_SOLUTION, psid, 'vote', value);
    pssdoc = await document.getStatus(domainId, document.TYPE_PROBLEM_SOLUTION, psid, uid);
    return [psdoc, pssdoc];
}

export async function getListStatus(domainId: string, psids: ObjectID[], uid: number) {
    const result = {};
    const res = await document.getMultiStatus(
        domainId, document.TYPE_PROBLEM_SOLUTION, { uid, psid: { $in: psids } },
    ).toArray();
    for (const i of res) result[i.psid] = i;
    return result;
}

bus.on('problem/delete', async (domainId, docId) => {
    const psids = await document.getMulti(
        domainId, document.TYPE_PROBLEM_SOLUTION,
        { parentType: document.TYPE_PROBLEM, parentId: docId },
    ).project({ docId: 1 }).map((psdoc) => psdoc.docId).toArray();
    return await Promise.all([
        document.deleteMulti(domainId, document.TYPE_PROBLEM_SOLUTION, { docId: { $in: psids } }),
        document.deleteMultiStatus(domainId, document.TYPE_PROBLEM_SOLUTION, { docId: { $in: psids } }),
    ]);
});

global.Hydro.model.solution = {
    count,
    add,
    get,
    edit,
    del,
    getMany,
    getMulti,
    reply,
    getReply,
    editReply,
    delReply,
    vote,
    getListStatus,
};
