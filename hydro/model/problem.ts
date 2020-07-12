import { ObjectID } from 'mongodb';
import { STATUS } from './builtin';
import * as file from './file';
import * as document from './document';
import * as domain from './domain';
import { Pdoc, Pdict } from '../interface';
import { ProblemNotFoundError } from '../error';
import readConfig from '../lib/readConfig';

export const pdocHidden: Pdoc = {
    _id: new ObjectID(),
    domainId: 'system',
    docId: -1,
    pid: '',
    owner: 1,
    title: '*',
    content: '',
    nSubmit: 0,
    nAccept: 0,
    tag: [],
    category: [],
    data: null,
    hidden: true,
    config: '',
};

export async function add(domainId: string, title: string, content: string, owner: number, {
    pid = null,
    data = null,
    category = [],
    tag = [],
    hidden = false,
}) {
    const d = await domain.inc(domainId, 'pidCounter', 1);
    if (!pid) pid = d.pidCounter.toString();
    return await document.add(
        domainId, content, owner, document.TYPE_PROBLEM, d.pidCounter, null, null,
        {
            pid, title, data, category, tag, hidden, nSubmit: 0, nAccept: 0,
        },
    );
}

export async function get(
    domainId: string, pid: string | number,
    uid: number = null, doThrow = true,
): Promise<Pdoc> {
    if (typeof pid !== 'number') {
        if (!Number.isNaN(parseInt(pid, 10))) pid = parseInt(pid, 10);
    }
    const pdoc = Number.isInteger(pid)
        ? await document.get(domainId, document.TYPE_PROBLEM, pid)
        : (await document.getMulti(domainId, document.TYPE_PROBLEM, { pid }).toArray())[0];
    if (!pdoc) {
        if (doThrow) throw new ProblemNotFoundError(domainId, pid);
        return null;
    }
    if (uid) {
        pdoc.psdoc = await document.getStatus(domainId, document.TYPE_PROBLEM, pdoc.docId, uid);
    }
    return pdoc;
}

export function getMany(
    domainId: string, query: any, sort: any, page: number, limit: number,
): Promise<Pdoc[]> {
    return document.getMulti(domainId, query)
        .sort(sort).skip((page - 1) * limit).limit(limit)
        .toArray();
}

export function getMulti(domainId: string, query: object) {
    return document.getMulti(domainId, document.TYPE_PROBLEM, query);
}

export function getMultiStatus(domainId: string, query: object) {
    return document.getMultiStatus(domainId, document.TYPE_PROBLEM, query);
}

export function edit(domainId: string, _id: number, $set: any): Promise<Pdoc> {
    return document.set(domainId, document.TYPE_PROBLEM, _id, $set);
}

export function inc(domainId: string, _id: number, field: string, n: number) {
    return document.inc(domainId, document.TYPE_PROBLEM, _id, field, n);
}

export function count(domainId: string, query: any) {
    return document.count(domainId, document.TYPE_PROBLEM, query);
}

export async function random(domainId: string, query: any) {
    const cursor = document.getMulti(domainId, document.TYPE_PROBLEM, query);
    const pcount = await cursor.count();
    if (pcount) {
        const pdoc = await cursor.skip(Math.floor(Math.random() * pcount)).limit(1).toArray();
        return pdoc[0].pid;
    } return null;
}

export async function getList(
    domainId: string, pids: Array<number | string>,
    getHidden = false, doThrow = true,
): Promise<Pdict> {
    pids = Array.from(new Set(pids));
    const r = {};
    const q: any = { $or: [{ docId: { $in: pids } }, { pid: { $in: pids } }] };
    if (!getHidden) q.hidden = false;
    const pdocs = await document.getMulti(domainId, document.TYPE_PROBLEM, q).toArray();
    for (const pdoc of pdocs) {
        r[pdoc.docId] = pdoc;
        r[pdoc.pid] = pdoc;
    }
    if (pdocs.length !== pids.length) {
        for (const pid of pids) {
            if (!r[pid]) {
                if (doThrow) {
                    throw new ProblemNotFoundError(domainId, pid);
                } else {
                    r[pid] = pdocHidden;
                }
            }
        }
    }
    return r;
}

export async function getListStatus(domainId: string, uid: number, pids: number[]) {
    const psdocs = await getMultiStatus(
        domainId, { uid, docId: { $in: Array.from(new Set(pids)) } },
    ).toArray();
    const r = {};
    for (const psdoc of psdocs) r[psdoc.docId] = psdoc;
    return r;
}

export async function updateStatus(
    domainId: string, pid: number, uid: number,
    rid: ObjectID, status: number,
) {
    try {
        await document.setIfNotStatus(
            domainId, document.TYPE_PROBLEM, pid, uid,
            'status', status, STATUS.STATUS_ACCEPTED, { rid },
        );
    } catch (e) {
        return false;
    }
    return true;
}

export function setStar(domainId: string, pid: number, uid: number, star: boolean) {
    return document.setStatus(domainId, document.TYPE_PROBLEM, pid, uid, { star });
}

export async function setTestdata(domainId: string, _id: number, filePath: string) {
    const pdoc = await get(domainId, _id);
    const config = await readConfig(filePath);
    const id = await file.add(filePath, 'data.zip');
    if (pdoc.data && typeof pdoc.data === 'object') file.dec(pdoc.data);
    return await edit(domainId, _id, { data: id, config });
}

global.Hydro.model.problem = {
    pdocHidden,
    add,
    inc,
    get,
    getMany,
    edit,
    count,
    random,
    getMulti,
    getList,
    getListStatus,
    getMultiStatus,
    setStar,
    setTestdata,
    updateStatus,
};
