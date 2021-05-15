import { ObjectID, FilterQuery } from 'mongodb';
import { Dictionary, escapeRegExp, pick } from 'lodash';
import { streamToBuffer } from '@hydrooj/utils/lib/utils';
import type { Readable } from 'stream';
import * as document from './document';
import { STATUS } from './builtin';
import storage from './storage';
import { buildProjection } from '../utils';
import type { ProblemStatusDoc, ProblemDict, Document } from '../interface';
import {
    ArrayKeys, MaybeArray, NumberKeys, Projection,
} from '../typeutils';
import { ProblemNotFoundError, ValidationError } from '../error';
import * as bus from '../service/bus';

export interface ProblemDoc extends Document { }
export type Field = keyof ProblemDoc;
const fields: Field[] = [];
export type Getter = (docId?: number, pid?: string) => Partial<ProblemDoc>;
const getters: Getter[] = [];

export class ProblemModel {
    static PROJECTION_LIST: Field[] = [
        '_id', 'domainId', 'docType', 'docId', 'pid',
        'owner', 'title', 'nSubmit', 'nAccept', 'difficulty',
        'tag', 'hidden',
    ];

    static PROJECTION_PUBLIC: Field[] = [
        ...ProblemModel.PROJECTION_LIST,
        'content', 'html', 'data', 'config', 'additional_file',
    ];

    static extend(getter: Getter) {
        getters.push(getter);
        fields.push(...Object.keys(getter(0, '0')) as any);
    }

    static create(docId?: number, pid?: string) {
        const result = {} as ProblemDoc;
        for (const getter of getters) {
            Object.assign(result, getter(docId, pid));
        }
        return result;
    }

    static async add(
        domainId: string, pid: string = null, title: string, content: string, owner: number,
        tag: string[] = [], hidden = false,
    ) {
        const [doc] = await ProblemModel.getMulti(domainId, {})
            .sort({ docId: -1 }).limit(1).project({ docId: 1 })
            .toArray();
        const result = await ProblemModel.addWithId(domainId, (doc?.docId || 0) + 1, pid, title, content, owner, tag, hidden);
        return result;
    }

    static async addWithId(
        domainId: string, docId: number, pid: string = null, title: string,
        content: string, owner: number, tag: string[] = [], hidden = false,
    ) {
        const args: Partial<ProblemDoc> = {
            title, tag, hidden, nSubmit: 0, nAccept: 0,
        };
        if (pid) args.pid = pid;
        await bus.serial('problem/before-add', args);
        const result = await document.add(domainId, content, owner, document.TYPE_PROBLEM, docId, null, null, args);
        args.content = content;
        args.owner = owner;
        args.docType = document.TYPE_PROBLEM;
        await bus.emit('problem/add', args, result);
        return result;
    }

    static async get(
        domainId: string, pid: string | number,
        uid: number = null, projection: Projection<ProblemDoc> = ProblemModel.PROJECTION_PUBLIC,
    ): Promise<ProblemDoc> {
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

    static getMulti(domainId: string, query: FilterQuery<ProblemDoc>, projection = ProblemModel.PROJECTION_LIST) {
        return document.getMulti(domainId, document.TYPE_PROBLEM, query, projection);
    }

    static getMultiStatus(domainId: string, query: FilterQuery<ProblemDoc>) {
        return document.getMultiStatus(domainId, document.TYPE_PROBLEM, query);
    }

    static async edit(domainId: string, _id: number, $set: Partial<ProblemDoc>): Promise<ProblemDoc> {
        const delpid = $set.pid === '';
        if (delpid) delete $set.pid;
        await bus.serial('problem/before-edit', $set);
        const result = await document.set(domainId, document.TYPE_PROBLEM, _id, $set, delpid ? { pid: '' } : undefined);
        await bus.emit('problem/edit', result);
        return result;
    }

    static push<T extends ArrayKeys<ProblemDoc>>(domainId: string, _id: number, key: ArrayKeys<ProblemDoc>, value: ProblemDoc[T][0]) {
        return document.push(domainId, document.TYPE_PROBLEM, _id, key, value);
    }

    static pull<T extends ArrayKeys<ProblemDoc>>(domainId: string, pid: number, key: ArrayKeys<ProblemDoc>, values: ProblemDoc[T][0][]) {
        return document.deleteSub(domainId, document.TYPE_PROBLEM, pid, key, values);
    }

    static inc(domainId: string, _id: number, field: NumberKeys<ProblemDoc>, n: number): Promise<ProblemDoc> {
        return document.inc(domainId, document.TYPE_PROBLEM, _id, field, n);
    }

    static count(domainId: string, query: FilterQuery<ProblemDoc>) {
        return document.count(domainId, document.TYPE_PROBLEM, query);
    }

    static async del(domainId: string, docId: number) {
        await bus.serial('problem/before-del', domainId, docId);
        const res = await Promise.all([
            document.deleteOne(domainId, document.TYPE_PROBLEM, docId),
            document.deleteMultiStatus(domainId, document.TYPE_PROBLEM, { docId }),
            storage.list(`problem/${domainId}/${docId}/`).then((items) => storage.del(items.map((item) => item.prefix + item.name))),
            bus.parallel('problem/delete', domainId, docId),
        ]);
        await bus.emit('problem/del', domainId, docId);
        return res;
    }

    static async addTestdata(domainId: string, pid: number, name: string, f: Readable | Buffer | string) {
        if (!name) throw new ValidationError('name');
        const [[, fileinfo]] = await Promise.all([
            document.getSub(domainId, document.TYPE_PROBLEM, pid, 'data', name),
            storage.put(`problem/${domainId}/${pid}/testdata/${name}`, f),
        ]);
        const meta = await storage.getMeta(`problem/${domainId}/${pid}/testdata/${name}`);
        if (!meta) throw new Error('Upload failed');
        const payload = { name, ...pick(meta, ['size', 'lastModified', 'etag']) };
        if (!fileinfo) await ProblemModel.push(domainId, pid, 'data', { _id: name, ...payload });
        else await document.setSub(domainId, document.TYPE_PROBLEM, pid, 'data', name, payload);
        await bus.emit('problem/addTestdata', domainId, pid, name, payload);
    }

    static async delTestdata(domainId: string, pid: number, name: string | string[]) {
        const names = (name instanceof Array) ? name : [name];
        await storage.del(names.map((t) => `problem/${domainId}/${pid}/testdata/${t}`));
        await ProblemModel.pull(domainId, pid, 'data', names);
        await bus.emit('problem/delTestdata', domainId, pid, names);
    }

    static async addAdditionalFile(domainId: string, pid: number, name: string, f: Readable | Buffer | string) {
        const [[, fileinfo]] = await Promise.all([
            document.getSub(domainId, document.TYPE_PROBLEM, pid, 'additional_file', name),
            storage.put(`problem/${domainId}/${pid}/additional_file/${name}`, f),
        ]);
        const meta = await storage.getMeta(`problem/${domainId}/${pid}/additional_file/${name}`);
        const payload = { name, ...pick(meta, ['size', 'lastModified', 'etag']) };
        if (!fileinfo) await ProblemModel.push(domainId, pid, 'additional_file', { _id: name, ...payload });
        else await document.setSub(domainId, document.TYPE_PROBLEM, pid, 'additional_file', name, payload);
        await bus.emit('problem/addAdditionalFile', domainId, pid, name, payload);
    }

    static async delAdditionalFile(domainId: string, pid: number, name: MaybeArray<string>) {
        const names = (name instanceof Array) ? name : [name];
        await storage.del(names.map((t) => `problem/${domainId}/${pid}/additional_file/${t}`));
        await ProblemModel.pull(domainId, pid, 'additional_file', names);
        await bus.emit('problem/delAdditionalFile', domainId, pid, names);
    }

    static async random(domainId: string, query: FilterQuery<ProblemDoc>): Promise<string | null> {
        const cursor = document.getMulti(domainId, document.TYPE_PROBLEM, query);
        const pcount = await cursor.count();
        if (pcount) {
            const pdoc = await cursor.skip(Math.floor(Math.random() * pcount)).limit(1).toArray();
            return pdoc[0].pid;
        } return null;
    }

    static async getList(
        domainId: string, pids: Array<number | string>,
        getHidden = false, doThrow = true, projection = ProblemModel.PROJECTION_PUBLIC,
    ): Promise<ProblemDict> {
        pids = Array.from(new Set(pids)).map((i) => (+i ? +i : i));
        const r = {};
        const l = {};
        const q: any = { $or: [{ docId: { $in: pids } }, { pid: { $in: pids } }] };
        if (!getHidden) q.hidden = false;
        const pdocs = await document.getMulti(domainId, document.TYPE_PROBLEM, q)
            .project(buildProjection(projection)).toArray();
        for (const pdoc of pdocs) {
            r[pdoc.docId] = pdoc;
            l[pdoc.pid] = pdoc;
        }
        // TODO enhance
        if (pdocs.length !== pids.length) {
            for (const pid of pids) {
                if (!(r[pid] || l[pid])) {
                    if (doThrow) throw new ProblemNotFoundError(domainId, pid);
                    else r[pid] = ProblemModel.create(undefined, pid.toString());
                }
            }
        }
        return Object.assign(r, l);
    }

    static async getPrefixList(domainId: string, prefix: string) {
        prefix = prefix.toLowerCase();
        const $regex = new RegExp(`\\A${escapeRegExp(prefix)}`, 'gmi');
        const filter = { $or: [{ pid: { $regex } }, { title: { $regex } }] };
        return await document.getMulti(domainId, document.TYPE_PROBLEM, filter, ['domainId', 'docId', 'pid', 'title']).toArray();
    }

    static async getListStatus(domainId: string, uid: number, pids: number[]) {
        const psdocs = await ProblemModel.getMultiStatus(
            domainId, { uid, docId: { $in: Array.from(new Set(pids)) } },
        ).toArray();
        const r: Dictionary<ProblemStatusDoc> = {};
        for (const psdoc of psdocs) r[psdoc.docId] = psdoc;
        return r;
    }

    static async updateStatus(
        domainId: string, pid: number, uid: number,
        rid: ObjectID, status: number, score: number,
    ) {
        const filter: FilterQuery<ProblemStatusDoc> = { rid: { $ne: rid }, status: STATUS.STATUS_ACCEPTED };
        const res = await document.setStatusIfNotCondition(
            domainId, document.TYPE_PROBLEM, pid, uid,
            filter, { rid, status, score },
        );
        return !!res;
    }

    static async incStatus(
        domainId: string, pid: number, uid: number,
        key: NumberKeys<ProblemStatusDoc>, count: number,
    ) {
        return await document.incStatus(domainId, document.TYPE_PROBLEM, pid, uid, key, count);
    }

    static setStar(domainId: string, pid: number, uid: number, star: boolean) {
        return document.setStatus(domainId, document.TYPE_PROBLEM, pid, uid, { star });
    }
}

bus.on('problem/addTestdata', async (domainId, docId, name) => {
    if (!['config.yaml', 'config.yml', 'Config.yaml', 'Config.yml'].includes(name)) return;
    const buf = await storage.get(`problem/${domainId}/${docId}/testdata/${name}`);
    await ProblemModel.edit(domainId, docId, { config: (await streamToBuffer(buf)).toString() });
});
bus.on('problem/delTestdata', async (domainId, docId, names) => {
    if (!names.includes('config.yaml')) return;
    await ProblemModel.edit(domainId, docId, { config: '' });
});

ProblemModel.extend((docId, pid) => ({
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
    data: [],
    additional_file: [],
    hidden: true,
    config: '',
    difficulty: 0,
}));

global.Hydro.model.problem = ProblemModel;
export default ProblemModel;
