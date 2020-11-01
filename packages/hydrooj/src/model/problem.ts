import { ObjectID, FilterQuery } from 'mongodb';
import { Dictionary } from 'lodash';
import { safeLoad } from 'js-yaml';
import { STATUS } from './builtin';
import * as file from './file';
import * as document from './document';
import * as domain from './domain';
import { ProblemStatusDoc, ProblemDataSource, Pdict } from '../interface';
import { NumberKeys, Projection } from '../typeutils';
import { ProblemNotFoundError } from '../error';
import * as testdataConfig from '../lib/testdataConfig';

export interface Pdoc {
    _id: ObjectID
}
export namespace Pdoc {
    export type Field = keyof Pdoc;
    export const fields: Field[] = [];
    type Getter = (docId?: number, pid?: string) => Partial<Pdoc>
    const getters: Getter[] = [];
    export function extend(getter: Getter) {
        getters.push(getter);
        fields.push(...Object.keys(getter(0, '0')) as any);
    }

    extend((docId, pid) => ({
        _id: new ObjectID(),
        domainId: 'system',
        docType: document.TYPE_PROBLEM,
        docId: docId || -1,
        pid: pid || docId.toString(),
        owner: 1,
        title: '*',
        content: '',
        html: false,
        nSubmit: 0,
        nAccept: 0,
        tag: [],
        category: [],
        data: null,
        hidden: true,
        config: {},
        acMsg: '',
        difficulty: 0,
        difficultyAlgo: 0,
        difficultyAdmin: 0,
        difficultySetting: null,
    }));

    export function create(docId?: number, pid?: string) {
        const result = {} as Pdoc;
        for (const getter of getters) {
            Object.assign(result, getter(docId, pid));
        }
        return result;
    }
}

export const SETTING_DIFFICULTY_ALGORITHM = 0;
export const SETTING_DIFFICULTY_ADMIN = 1;
export const SETTING_DIFFICULTY_AVERAGE = 2;

export const SETTING_DIFFICULTY_RANGE = [
    [SETTING_DIFFICULTY_ALGORITHM, 'Use algorithm calculated'],
    [SETTING_DIFFICULTY_ADMIN, 'Use admin specificed'],
    [SETTING_DIFFICULTY_AVERAGE, 'Use average of above'],
];

export const PROJECTION_LIST: Pdoc.Field[] = [
    '_id', 'domainId', 'docType', 'docId', 'pid',
    'owner', 'title', 'nSubmit', 'nAccept', 'difficulty',
    'tag', 'category', 'hidden',
];

export const PROJECTION_PUBLIC: Pdoc.Field[] = [
    ...PROJECTION_LIST,
    'content', 'html', 'data', 'config', 'acMsg',
];

export async function add(
    domainId: string, pid: string = null, title: string, content: string, owner: number,
    tag: string[] = [], category: string[] = [], data: ProblemDataSource = null, hidden = false,
) {
    const pidCounter = await domain.inc(domainId, 'pidCounter', 1);
    if (!pid) pid = pidCounter.toString();
    return await document.add(
        domainId, content, owner, document.TYPE_PROBLEM, pidCounter, null, null,
        {
            pid, title, data, category, tag, hidden, nSubmit: 0, nAccept: 0,
        },
    ) as number;
}

export async function get(
    domainId: string, pid: string | number,
    uid: number = null, projection: Projection<Pdoc> = PROJECTION_PUBLIC,
): Promise<Pdoc> {
    if (typeof pid !== 'number') {
        if (Number.isSafeInteger(parseInt(pid, 10))) pid = parseInt(pid, 10);
    }
    const pdoc = typeof pid === 'number'
        ? await document.get(domainId, document.TYPE_PROBLEM, pid, projection)
        : (await document.getMulti(domainId, document.TYPE_PROBLEM, { pid }).toArray())[0];
    if (!pdoc) return null;
    if (uid) {
        pdoc.psdoc = await document.getStatus(domainId, document.TYPE_PROBLEM, pdoc.docId, uid);
    }
    return pdoc;
}

export function getMulti(domainId: string, query: FilterQuery<Pdoc>, projection = PROJECTION_LIST) {
    return document.getMulti(domainId, document.TYPE_PROBLEM, query, projection);
}

export function getMultiStatus(domainId: string, query: FilterQuery<Pdoc>) {
    return document.getMultiStatus(domainId, document.TYPE_PROBLEM, query);
}

export function edit(domainId: string, _id: number, $set: Partial<Pdoc>): Promise<Pdoc> {
    return document.set(domainId, document.TYPE_PROBLEM, _id, $set);
}

export function inc(domainId: string, _id: number, field: NumberKeys<Pdoc>, n: number): Promise<Pdoc> {
    return document.inc(domainId, document.TYPE_PROBLEM, _id, field, n);
}

export function count(domainId: string, query: FilterQuery<Pdoc>) {
    return document.count(domainId, document.TYPE_PROBLEM, query);
}

export async function random(domainId: string, query: FilterQuery<Pdoc>): Promise<string | null> {
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
    const l = {};
    const q: any = { $or: [{ docId: { $in: pids } }, { pid: { $in: pids } }] };
    if (!getHidden) q.hidden = false;
    const pdocs = await document.getMulti(domainId, document.TYPE_PROBLEM, q).toArray();
    for (const pdoc of pdocs) {
        r[pdoc.docId] = pdoc;
        l[pdoc.pid] = pdoc;
    }
    // TODO enhance
    if (pdocs.length !== pids.length) {
        for (const pid of pids) {
            if (!(r[pid] || l[pid])) {
                if (doThrow) throw new ProblemNotFoundError(domainId, pid);
                else r[pid] = Pdoc.create(undefined, pid.toString());
            }
        }
    }
    return r;
}

export async function getListStatus(domainId: string, uid: number, pids: number[]) {
    const psdocs = await getMultiStatus(
        domainId, { uid, docId: { $in: Array.from(new Set(pids)) } },
    ).toArray();
    const r: Dictionary<ProblemStatusDoc> = {};
    for (const psdoc of psdocs) r[psdoc.docId] = psdoc;
    return r;
}

export async function updateStatus(
    domainId: string, pid: number, uid: number,
    rid: ObjectID, status: number,
) {
    const res = await document.setIfNotStatus(
        domainId, document.TYPE_PROBLEM, pid, uid,
        'status', status, STATUS.STATUS_ACCEPTED, { rid },
    );
    return !!res;
}

export function setStar(domainId: string, pid: number, uid: number, star: boolean) {
    return document.setStatus(domainId, document.TYPE_PROBLEM, pid, uid, { star });
}

export async function setTestdata(domainId: string, _id: number, filePath: string) {
    const pdoc = await get(domainId, _id);
    const config = await testdataConfig.readConfig(filePath);
    const id = await file.add(filePath, 'data.zip', 1);
    if (pdoc.data instanceof ObjectID) file.del(pdoc.data);
    return await edit(domainId, _id, { data: id, config: safeLoad(config) as any });
}

global.Hydro.model.problem = {
    Pdoc,

    PROJECTION_LIST,
    PROJECTION_PUBLIC,

    SETTING_DIFFICULTY_ADMIN,
    SETTING_DIFFICULTY_ALGORITHM,
    SETTING_DIFFICULTY_AVERAGE,
    SETTING_DIFFICULTY_RANGE,

    add,
    inc,
    get,
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
