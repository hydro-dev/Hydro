import {
    escapeRegExp, pick,
} from 'lodash';
import { FilterQuery, ObjectID } from 'mongodb';
import type { Readable } from 'stream';
import { streamToBuffer } from '@hydrooj/utils/lib/utils';
import { ProblemNotFoundError, ValidationError } from '../error';
import type {
    Document, ProblemDict, ProblemStatusDoc, User,
} from '../interface';
import { parseConfig } from '../lib/testdataConfig';
import * as bus from '../service/bus';
import {
    ArrayKeys, MaybeArray, NumberKeys, Projection,
} from '../typeutils';
import { buildProjection } from '../utils';
import { PERM, STATUS } from './builtin';
import * as document from './document';
import DomainModel from './domain';
import storage from './storage';
import user from './user';

export interface ProblemDoc extends Document { }
export type Field = keyof ProblemDoc;

function sortable(source: string) {
    return source.replace(/(\d+)/g, (str) => (str.length >= 6 ? str : ('0'.repeat(6 - str.length) + str)));
}

export class ProblemModel {
    static PROJECTION_LIST: Field[] = [
        '_id', 'domainId', 'docType', 'docId', 'pid',
        'owner', 'title', 'nSubmit', 'nAccept', 'difficulty',
        'tag', 'hidden', 'assign', 'stats',
    ];

    static PROJECTION_PUBLIC: Field[] = [
        ...ProblemModel.PROJECTION_LIST,
        'content', 'html', 'data', 'config', 'additional_file',
        'reference',
    ];

    static default = {
        _id: new ObjectID(),
        domainId: 'system',
        docType: document.TYPE_PROBLEM,
        docId: 0,
        pid: '',
        owner: 1,
        title: '*',
        content: '',
        html: false,
        nSubmit: 0,
        nAccept: 0,
        tag: [],
        data: [],
        additional_file: [],
        stats: {},
        hidden: true,
        assign: [],
        config: '',
        difficulty: 0,
    };

    static deleted = {
        _id: new ObjectID(),
        domainId: 'system',
        docType: document.TYPE_PROBLEM,
        docId: -1,
        pid: null,
        owner: 1,
        title: '*',
        content: 'Deleted Problem',
        html: false,
        nSubmit: 0,
        nAccept: 0,
        tag: [],
        data: [],
        additional_file: [],
        stats: {},
        hidden: true,
        assign: [],
        config: '',
        difficulty: 0,
    };

    static async add(
        domainId: string, pid: string = '', title: string, content: string, owner: number,
        tag: string[] = [], hidden = false, assign: string[] = [],
    ) {
        const [doc] = await ProblemModel.getMulti(domainId, {})
            .sort({ docId: -1 }).limit(1).project({ docId: 1 })
            .toArray();
        const result = await ProblemModel.addWithId(
            domainId, (doc?.docId || 0) + 1, pid,
            title, content, owner, tag, hidden, assign,
        );
        return result;
    }

    static async addWithId(
        domainId: string, docId: number, pid: string = '', title: string,
        content: string, owner: number, tag: string[] = [], hidden = false, assign: string[] = [],
    ) {
        const args: Partial<ProblemDoc> = {
            title, tag, hidden, assign, nSubmit: 0, nAccept: 0, sort: sortable(pid || `P${docId}`),
        };
        if (pid) args.pid = pid;
        await bus.serial('problem/before-add', domainId, content, owner, docId, args);
        const result = await document.add(domainId, content, owner, document.TYPE_PROBLEM, docId, null, null, args);
        args.content = content;
        args.owner = owner;
        args.docType = document.TYPE_PROBLEM;
        args.domainId = domainId;
        await bus.emit('problem/add', args, result);
        return result;
    }

    static async get(
        domainId: string, pid: string | number,
        projection: Projection<ProblemDoc> = ProblemModel.PROJECTION_PUBLIC,
        rawConfig = false,
    ): Promise<ProblemDoc | null> {
        if (Number.isSafeInteger(+pid)) pid = +pid;
        const res = typeof pid === 'number'
            ? await document.get(domainId, document.TYPE_PROBLEM, pid, projection)
            : (await document.getMulti(domainId, document.TYPE_PROBLEM, { sort: sortable(pid), pid }).toArray())[0];
        if (!res) return null;
        try {
            if (!rawConfig) res.config = await parseConfig(res.config);
        } catch (e) {
            res.config = `Cannot parse: ${e.message}`;
        }
        return res;
    }

    static getMulti(domainId: string, query: FilterQuery<ProblemDoc>, projection = ProblemModel.PROJECTION_LIST) {
        return document.getMulti(domainId, document.TYPE_PROBLEM, query, projection).sort({ sort: 1 });
    }

    static async list(
        domainId: string, query: FilterQuery<ProblemDoc>,
        page: number, pageSize: number,
        projection = ProblemModel.PROJECTION_LIST, uid?: number,
    ): Promise<[ProblemDoc[], number, number]> {
        const union = await DomainModel.getUnion(domainId);
        const domainIds = [domainId];
        if (union?.problem) domainIds.push(...union.union);
        let count = 0;
        const pdocs = [];
        for (const id of domainIds) {
            // TODO enhance performance
            if (typeof uid === 'number') {
                // eslint-disable-next-line no-await-in-loop
                const udoc = await user.getById(id, uid);
                if (!udoc.hasPerm(PERM.PERM_VIEW_PROBLEM)) continue;
            }
            // eslint-disable-next-line no-await-in-loop
            const ccount = await document.getMulti(id, document.TYPE_PROBLEM, query).count();
            if (pdocs.length < pageSize && (page - 1) * pageSize - count <= ccount) {
                // eslint-disable-next-line no-await-in-loop
                pdocs.push(...await document.getMulti(id, document.TYPE_PROBLEM, query, projection)
                    .sort({ sort: 1, docId: 1 })
                    .skip(Math.max((page - 1) * pageSize - count, 0)).limit(pageSize - pdocs.length).toArray());
            }
            count += ccount;
        }
        return [pdocs, Math.ceil(count / pageSize), count];
    }

    static getStatus(domainId: string, docId: number, uid: number) {
        return document.getStatus(domainId, document.TYPE_PROBLEM, docId, uid);
    }

    static getMultiStatus(domainId: string, query: FilterQuery<ProblemDoc>) {
        return document.getMultiStatus(domainId, document.TYPE_PROBLEM, query);
    }

    static async edit(domainId: string, _id: number, $set: Partial<ProblemDoc>): Promise<ProblemDoc> {
        const delpid = $set.pid === '';
        if (delpid) {
            delete $set.pid;
            $set.sort = sortable(`P${_id}`);
        } else if ($set.pid) {
            $set.sort = sortable($set.pid);
        }
        await bus.serial('problem/before-edit', $set);
        const result = await document.set(domainId, document.TYPE_PROBLEM, _id, $set, delpid ? { pid: '' } : undefined);
        await bus.emit('problem/edit', result);
        return result;
    }

    static async copy(domainId: string, _id: number, target: string, pid?: string) {
        const original = await ProblemModel.get(domainId, _id);
        if (!original) throw new ProblemNotFoundError(domainId, _id);
        if (pid && (/^[0-9]+$/.test(pid) || await ProblemModel.get(target, pid))) pid = '';
        if (!pid && original.pid && !await ProblemModel.get(target, original.pid)) pid = original.pid;
        const docId = await ProblemModel.add(
            target, pid, original.title, original.content,
            original.owner, original.tag, original.hidden,
        );
        await ProblemModel.edit(target, docId, { reference: { domainId, pid: _id } });
        return docId;
    }

    static push<T extends ArrayKeys<ProblemDoc>>(domainId: string, _id: number, key: ArrayKeys<ProblemDoc>, value: ProblemDoc[T][0]) {
        return document.push(domainId, document.TYPE_PROBLEM, _id, key, value);
    }

    static pull<T extends ArrayKeys<ProblemDoc>>(domainId: string, pid: number, key: ArrayKeys<ProblemDoc>, values: ProblemDoc[T][0][]) {
        return document.deleteSub(domainId, document.TYPE_PROBLEM, pid, key, values);
    }

    static inc(domainId: string, _id: number, field: NumberKeys<ProblemDoc> | string, n: number): Promise<ProblemDoc> {
        return document.inc(domainId, document.TYPE_PROBLEM, _id, field as any, n);
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
        return !!res[0][0].deletedCount;
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
        payload.lastModified ||= new Date();
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

    static async random(domainId: string, query: FilterQuery<ProblemDoc>): Promise<string | number | null> {
        const cursor = document.getMulti(domainId, document.TYPE_PROBLEM, query);
        const pcount = await cursor.count();
        if (pcount) {
            const pdoc = await cursor.skip(Math.floor(Math.random() * pcount)).limit(1).toArray();
            return pdoc[0].pid || pdoc[0].docId;
        } return null;
    }

    static async getList(
        domainId: string, pids: number[], canViewHidden: number | boolean = false,
        group: string[] = [], doThrow = true, projection = ProblemModel.PROJECTION_PUBLIC,
        indexByDocIdOnly = false,
    ): Promise<ProblemDict> {
        if (!pids?.length) return [];
        const r: Record<number, ProblemDoc> = {};
        const l: Record<string, ProblemDoc> = {};
        const q: any = { docId: { $in: pids } };
        let pdocs = await document.getMulti(domainId, document.TYPE_PROBLEM, q)
            .project(buildProjection(projection)).toArray();
        if (group.length > 0) {
            pdocs = pdocs.filter((i) => !i.assign?.length || Set.intersection(group, i.assign).size);
        }
        if (canViewHidden !== true) {
            pdocs = pdocs.filter((i) => i.owner === canViewHidden || !i.hidden);
        }
        for (const pdoc of pdocs) {
            try {
                // eslint-disable-next-line no-await-in-loop
                pdoc.config = await parseConfig(pdoc.config as string);
            } catch (e) {
                pdoc.config = `Cannot parse: ${e.message}`;
            }
            r[pdoc.docId] = pdoc;
            if (pdoc.pid) l[pdoc.pid] = pdoc;
        }
        // TODO enhance
        if (pdocs.length !== pids.length) {
            for (const pid of pids) {
                if (!(r[pid] || l[pid])) {
                    if (doThrow) throw new ProblemNotFoundError(domainId, pid);
                    if (!indexByDocIdOnly) r[pid] = { ...ProblemModel.default, domainId, pid: pid.toString() };
                }
            }
        }
        return indexByDocIdOnly ? r : Object.assign(r, l);
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
        const r: Record<string, ProblemStatusDoc> = {};
        for (const psdoc of psdocs) {
            r[psdoc.docId] = psdoc;
            r[`${psdoc.domainId}#${psdoc.docId}`] = psdoc;
        }
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

    static canViewBy(pdoc: ProblemDoc, udoc: User) {
        if (!udoc.hasPerm(PERM.PERM_VIEW_PROBLEM)) return false;
        if (udoc.own(pdoc)) return true;
        if (udoc.hasPerm(PERM.PERM_VIEW_PROBLEM_HIDDEN)) return true;
        if (pdoc.hidden) return false;
        if (!pdoc.assign.length) return true;
        return !!Set.intersection(pdoc.assign, udoc.group).size;
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

global.Hydro.model.problem = ProblemModel;
export default ProblemModel;
