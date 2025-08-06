import { flatten } from 'lodash';
import { Filter, ObjectId } from 'mongodb';
import { TrainingAlreadyEnrollError, TrainingNotFoundError } from '../error';
import { TrainingDoc, TrainingNode } from '../interface';
import * as document from './document';

export function getStatus(domainId: string, tid: ObjectId, uid: number) {
    return document.getStatus(domainId, document.TYPE_TRAINING, tid, uid);
}

export function getMultiStatus(domainId: string, query: Filter<TrainingDoc>) {
    return document.getMultiStatus(domainId, document.TYPE_TRAINING, query);
}

export async function getListStatus(domainId: string, uid: number, tids: ObjectId[]) {
    const tsdocs = await getMultiStatus(
        domainId, { uid, docId: { $in: Array.from(new Set(tids)) } },
    ).toArray();
    const r = {};
    for (const tsdoc of tsdocs) r[tsdoc.docId] = tsdoc;
    return r;
}

export async function enroll(domainId: string, tid: ObjectId, uid: number) {
    try {
        await document.setIfNotStatus(domainId, document.TYPE_TRAINING, tid, uid, 'enroll', 1, 1, {});
    } catch (e) {
        throw new TrainingAlreadyEnrollError(tid, uid);
    }
    return await document.inc(domainId, document.TYPE_TRAINING, tid, 'attend', 1);
}

export function setStatus(domainId: string, tid: ObjectId, uid: number, $set: any) {
    return document.setStatus(domainId, document.TYPE_TRAINING, tid, uid, $set);
}

export function add(
    domainId: string, title: string, content: string,
    owner: number, dag: TrainingNode[] = [], description = '', pin = 0,
) {
    return document.add(domainId, content, owner, document.TYPE_TRAINING, null, null, null, {
        dag,
        title,
        description,
        attend: 0,
        pin,
    });
}

export function edit(domainId: string, tid: ObjectId, $set: Partial<TrainingDoc>) {
    return document.set(domainId, document.TYPE_TRAINING, tid, $set);
}

export function del(domainId: string, tid: ObjectId) {
    return Promise.all([
        document.deleteOne(domainId, document.TYPE_TRAINING, tid),
        document.deleteMultiStatus(domainId, document.TYPE_TRAINING, { docId: tid }),
    ]);
}

export function getPids(dag: TrainingNode[]) {
    return Array.from(new Set(flatten(dag.map((node) => node.pids))));
}

export function isDone(node: TrainingNode, doneNids: Set<number> | number[], donePids: Set<number> | number[]) {
    return (Set.isSuperset(new Set(doneNids), new Set(node.requireNids))
        && Set.isSuperset(new Set(donePids), new Set(node.pids)));
}

export function isProgress(node: TrainingNode, doneNids: Set<number> | number[], donePids: Set<number> | number[], progPids: Set<number> | number[]) {
    return (Set.isSuperset(new Set(doneNids), new Set(node.requireNids))
        && !Set.isSuperset(new Set(donePids), new Set(node.pids))
        && Set.intersection(
            Set.union(new Set(donePids), new Set(progPids)),
            new Set(node.pids),
        ).size);
}

export function isOpen(node: TrainingNode, doneNids: Set<number> | number[], donePids: Set<number> | number[], progPids: Set<number> | number[]) {
    return (Set.isSuperset(new Set(doneNids), new Set(node.requireNids))
        && !Set.isSuperset(new Set(donePids), new Set(node.pids))
        && !Set.intersection(
            Set.union(new Set(donePids), new Set(progPids)),
            new Set(node.pids),
        ).size);
}

export const isInvalid = (node: TrainingNode, doneNids: Set<number> | number[]) =>
    !Set.isSuperset(new Set(doneNids), new Set(node.requireNids));

export async function count(domainId: string, query: Filter<TrainingDoc>) {
    return await document.count(domainId, document.TYPE_TRAINING, query);
}

export async function get(domainId: string, tid: ObjectId) {
    const tdoc = await document.get(domainId, document.TYPE_TRAINING, tid);
    if (!tdoc) throw new TrainingNotFoundError(domainId, tid);
    for (const i in tdoc.dag) {
        for (const j in tdoc.dag[i].pids) {
            if (Number.isSafeInteger(Number.parseInt(tdoc.dag[i].pids[j], 10))) {
                tdoc.dag[i].pids[j] = Number.parseInt(tdoc.dag[i].pids[j], 10);
            }
        }
    }
    return tdoc;
}

export const getMulti = (domainId: string, query: Filter<TrainingDoc> = {}) =>
    document.getMulti(domainId, document.TYPE_TRAINING, query).sort({ pin: -1, _id: -1 });

export async function getList(domainId: string, tids: ObjectId[]) {
    const tdocs = await getMulti(
        domainId, { _id: { $in: Array.from(new Set(tids)) } },
    ).toArray();
    const r = {};
    for (const tdoc of tdocs) r[tdoc.docId.toString()] = tdoc;
    return r;
}

global.Hydro.model.training = {
    getPids,
    isDone,
    isProgress,
    isOpen,
    isInvalid,
    add,
    edit,
    del,
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
