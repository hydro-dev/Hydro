import { ObjectID } from 'mongodb';
import * as document from './document';
import { TrainingNotFoundError, TrainingAlreadyEnrollError } from '../error';

export function getStatus(domainId: string, tid: ObjectID, uid: number) {
    return document.getStatus(domainId, document.TYPE_TRAINING, tid, uid);
}

export function getMultiStatus(domainId: string, query: any) {
    return document.getMultiStatus(domainId, document.TYPE_TRAINING, query);
}

export async function getListStatus(domainId: string, uid: number, tids: ObjectID[]) {
    const tsdocs = await getMultiStatus(
        domainId, { uid, tid: { $in: Array.from(new Set(tids)) } },
    ).toArray();
    const r = {};
    for (const tsdoc of tsdocs) r[tsdoc.pid] = tsdoc;
    return r;
}

export async function enroll(domainId: string, tid: ObjectID, uid: number) {
    try {
        await document.setStatus(domainId, document.TYPE_TRAINING, tid, uid, { enroll: 1 });
    } catch (e) {
        throw new TrainingAlreadyEnrollError(tid, uid);
    }
    return await document.inc(domainId, document.TYPE_TRAINING, tid, 'enroll', 1);
}

export function setStatus(domainId: string, tid: ObjectID, uid: number, $set: any) {
    return document.setStatus(domainId, document.TYPE_TRAINING, tid, uid, $set);
}

export function add(
    domainId: string, title: string, content: string,
    owner: number, dag = [], description = '',
) {
    return document.add(domainId, content, owner, document.TYPE_TRAINING, null, null, null, {
        dag,
        title,
        description,
        enroll: 0,
    });
}

export function edit(domainId: string, tid: ObjectID, $set) {
    return document.set(domainId, document.TYPE_TRAINING, tid, $set);
}

export function getPids(tdoc): number[] {
    const pids: Set<number> = new Set();
    for (const node of tdoc.dag) {
        for (const pid of node.pids) pids.add(pid);
    }
    return Array.from(pids);
}

export function isDone(node, doneNids, donePids) {
    return (Set.isSuperset(new Set(doneNids), new Set(node.requireNids))
        && Set.isSuperset(new Set(donePids), new Set(node.pids)));
}

export function isProgress(node, doneNids, donePids, progPids) {
    return (Set.isSuperset(new Set(doneNids), new Set(node.requireNids))
        && !Set.isSuperset(new Set(donePids), new Set(node.pids))
        && Set.intersection(
            Set.union(new Set(donePids), new Set(progPids)),
            new Set(node.pids),
        ).size);
}

export function isOpen(node, doneNids, donePids, progPids) {
    return (Set.isSuperset(new Set(doneNids), new Set(node.requireNids))
        && !Set.isSuperset(new Set(donePids), new Set(node.pids))
        && !Set.intersection(
            Set.union(new Set(donePids), new Set(progPids)),
            new Set(node.pids),
        ).size);
}

export const isInvalid = (node, doneNids) =>
    !Set.isSuperset(new Set(doneNids), new Set(node.requireNids));

export const count = (domainId: string, query: any) =>
    document.count(domainId, document.TYPE_TRAINING, query);

export async function get(domainId, tid) {
    const tdoc = await document.get(domainId, document.TYPE_TRAINING, tid);
    if (!tdoc) throw new TrainingNotFoundError(tid);
    for (const i in tdoc.dag) {
        for (const j in tdoc.dag[i].pids) {
            if (Number.isSafeInteger(parseInt(tdoc.dag[i].pids[j], 10))) {
                tdoc.dag[i].pids[j] = parseInt(tdoc.dag[i].pids[j], 10);
            }
        }
    }
    return tdoc;
}

export async function getList(domainId: string, tids: ObjectID[]) {
    const tdocs = await this.getMulti(
        domainId, { _id: { $in: Array.from(new Set(tids)) } },
    ).toArray();
    const r = {};
    for (const tdoc of tdocs) r[tdoc.docId] = tdoc;
    return r;
}

export const getMulti = (domainId: string, query: any = {}) =>
    document.getMulti(domainId, document.TYPE_TRAINING, query).sort('_id', 1);

global.Hydro.model.training = {
    getPids,
    isDone,
    isProgress,
    isOpen,
    isInvalid,
    add,
    edit,
    count,
    get,
    getList,
    getMulti,
    getMultiStatus,
    getStatus,
    enroll,
    setStatus,
    getListStatus,
};
