/* eslint-disable no-await-in-loop */
import child from 'child_process';
import os from 'os';
import path from 'path';
import { Readable } from 'stream';
import { Entry, ZipReader } from '@zip.js/zip.js';
import fs from 'fs-extra';
import * as yaml from 'js-yaml';
import { keyBy, pick } from 'lodash';
import { Filter, ObjectId } from 'mongodb';
import { ProblemConfigFile, ProblemType } from '@hydrooj/common';
import {
    extractZip, Logger, size, streamToBuffer,
} from '@hydrooj/utils/lib/utils';
import { Context } from '../context';
import { FileUploadError, NotFoundError, ProblemNotFoundError, ValidationError } from '../error';
import type {
    Document, ProblemDict, ProblemStatusDoc, User,
} from '../interface';
import type { StatementEntry } from '../lib/content';
import { normalizeStatements } from '../lib/content';
import { parseConfig } from '../lib/testdataConfig';
import bus from '../service/bus';
import db from '../service/db';
import {
    ArrayKeys, MaybeArray, NumberKeys, Projection,
} from '../typeutils';
import { buildProjection } from '../utils';
import { PERM, STATUS } from './builtin';
import * as document from './document';
import DomainModel from './domain';
import RecordModel from './record';
import SolutionModel from './solution';
import storage from './storage';
import SystemModel from './system';

export interface ProblemDoc extends Document { }
export type Field = keyof ProblemDoc;

export interface ProblemStatementDoc extends StatementEntry {
    _id: ObjectId;
    domainId: string;
    docType: number;
    docId: number;
}

const collStatement = db.collection('problem.statement');

const logger = new Logger('problem');
function sortable(source: string, namespaces: Record<string, string>) {
    const [namespace, pid] = source.includes('-') ? source.split('-') : ['default', source];
    return ((namespaces ? `${namespaces[namespace]}-` : '') + pid)
        .replace(/(\d+)/g, (str) => (str.length >= 6 ? str : ('0'.repeat(6 - str.length) + str)));
}

function findOverrideContent(dir: string, base: string) {
    if (!fs.existsSync(dir)) return null;
    let files = fs.readdirSync(dir);
    if (files.includes(`${base}.md`)) return fs.readFileSync(path.join(dir, `${base}.md`), 'utf8');
    if (files.includes(`${base}.pdf`)) return `@[PDF](file://${base}.pdf)`;
    const languages = {};
    files = files.filter((i) => new RegExp(`^${base}(?:_|\\.)([a-zA-Z_-]+)\\.(md|pdf)$`).test(i));
    if (!files.length) return null;
    for (const file of files) {
        const match = file.match(`^${base}(?:_|\\.)([a-zA-Z_-]+)\\.(md|pdf)$`);
        const lang = match[1];
        const ext = match[2];
        if (ext === 'pdf') languages[lang] = `@[PDF](file://${file})`;
        else languages[lang] = fs.readFileSync(path.join(dir, file), 'utf8');
    }
    return JSON.stringify(languages);
}

interface ProblemImportOptions {
    preferredPrefix?: string;
    progress?: any;
    override?: boolean;
    operator?: number;
    delSource?: boolean;
    hidden?: boolean;
}

interface ProblemCreateOptions {
    difficulty?: number;
    hidden?: boolean;
    reference?: { domainId: string, pid: number };
}

const PROJECTION_BASE: Field[] = [
    '_id', 'domainId', 'docType', 'docId', 'pid',
    'owner', 'title',
];

export class ProblemModel {
    static PROJECTION_CONTEST_LIST: Field[] = [
        ...PROJECTION_BASE, 'config',
    ];

    static PROJECTION_LIST: Field[] = [
        ...PROJECTION_BASE,
        'nSubmit', 'nAccept', 'difficulty', 'tag', 'hidden',
        'stats',
    ];

    static PROJECTION_CONTEST_DETAIL: Field[] = [
        ...ProblemModel.PROJECTION_CONTEST_LIST,
        'content', 'html', 'data', 'additional_file',
        'reference', 'maintainer',
    ];

    static PROJECTION_PUBLIC: Field[] = [
        ...ProblemModel.PROJECTION_LIST,
        'content', 'html', 'data', 'config', 'additional_file',
        'reference', 'maintainer',
    ];

    static default = {
        _id: new ObjectId(),
        domainId: 'system',
        docType: document.TYPE_PROBLEM,
        docId: 0,
        pid: '',
        owner: 1,
        title: '*',
        content: '',
        nSubmit: 0,
        nAccept: 0,
        tag: [],
        data: [],
        additional_file: [],
        stats: {},
        hidden: true,
        config: '',
        difficulty: 0,
    };

    static deleted = {
        _id: new ObjectId(),
        domainId: 'system',
        docType: document.TYPE_PROBLEM,
        docId: -1,
        pid: null,
        owner: 1,
        title: '*',
        content: 'Deleted Problem',
        nSubmit: 0,
        nAccept: 0,
        tag: [],
        data: [],
        additional_file: [],
        stats: {},
        hidden: true,
        config: '',
        difficulty: 0,
    };

    static async add(
        domainId: string, pid: string = '', title: string, content: string, owner: number,
        tag: string[] = [], meta: ProblemCreateOptions = {},
    ) {
        const [doc] = await ProblemModel.getMulti(domainId, {})
            .withReadPreference('primary')
            .sort({ docId: -1 }).limit(1).project({ docId: 1 })
            .toArray();
        const result = await ProblemModel.addWithId(
            domainId, (doc?.docId || 0) + 1, pid,
            title, content, owner, tag, meta,
        );
        return result;
    }

    static async addWithId(
        domainId: string, docId: number, pid: string = '', title: string,
        content: string, owner: number, tag: string[] = [],
        meta: ProblemCreateOptions = {},
    ) {
        const ddoc = await DomainModel.get(domainId);
        const args: Partial<ProblemDoc> = {
            title,
            tag,
            hidden: meta.hidden || false,
            nSubmit: 0,
            nAccept: 0,
            sort: sortable(pid || `P${docId}`, ddoc?.namespaces),
            data: [],
            additional_file: [],
        };
        if (pid) args.pid = pid;
        if (meta.difficulty) args.difficulty = meta.difficulty;
        if (meta.reference) args.reference = meta.reference;
        await bus.parallel('problem/before-add', domainId, content, owner, docId, args);
        const entries = normalizeStatements(args.content ?? content, SystemModel.get('server.language') || 'zh');
        args.content = '';
        delete args.html;
        const result = await document.add(domainId, '', owner, document.TYPE_PROBLEM, docId, null, null, args);
        args.owner = owner;
        args.docType = document.TYPE_PROBLEM;
        args.domainId = domainId;
        args.docId = docId;
        if (entries.length) await ProblemModel.setStatements(domainId, docId, entries, false, args.reference);
        bus.emit('problem/add', args, result);
        return result;
    }

    static async getStatements(pdoc: ProblemDoc, followRedirect = true): Promise<ProblemStatementDoc[]> {
        const rows = await collStatement.find({ domainId: pdoc.domainId, docId: pdoc.docId }).sort({ _id: 1 }).toArray();
        if (rows.length) return rows;
        const entries = normalizeStatements(pdoc.content || '', SystemModel.get('server.language') || 'zh', pdoc.html);
        if (!entries.length && followRedirect && pdoc.reference) {
            const source = await ProblemModel.get(pdoc.reference.domainId, pdoc.reference.pid);
            if (!source) throw new ProblemNotFoundError(pdoc.reference.domainId, pdoc.reference.pid);
            return ProblemModel.getStatements(source, false);
        }
        return entries.map((entry) => ({
            _id: new ObjectId(),
            domainId: pdoc.domainId,
            docType: document.TYPE_PROBLEM,
            docId: pdoc.docId,
            ...entry,
        }));
    }

    static async setStatements(
        domainId: string, docId: number, entries: StatementEntry[], forceCompile = false,
        reference?: ProblemDoc['reference'],
    ): Promise<ProblemDoc> {
        const existing = await collStatement.find({ domainId, docId }).toArray();
        const prevByName = new Map(existing.map((r) => [r.name, r]));
        const ops: Promise<any>[] = [];
        for (const entry of entries) {
            const prev = prevByName.get(entry.name);
            let render = forceCompile ? undefined : prev?.render;
            const renderer = global.Hydro?.module?.contentRenderer?.[entry.name.split('.').pop()];
            if (renderer?.compile && typeof entry.content === 'string' && (forceCompile || prev?.content !== entry.content)) {
                try {
                    render = await renderer.compile(entry, {
                        readAdditionalFile: async (name) => streamToBuffer(
                            await storage.get(`problem/${reference?.domainId ?? domainId}/${reference?.pid ?? docId}/additional_file/${name}`),
                        ),
                    });
                } catch (e) {
                    render = { error: e?.message || String(e).slice(0, 500) };
                }
            }
            const doc: any = {
                _id: prev?._id ?? new ObjectId(),
                domainId,
                docType: document.TYPE_PROBLEM,
                docId,
                name: entry.name,
                lang: entry.lang,
            };
            if (entry.content !== undefined) doc.content = entry.content;
            if (entry.file) doc.file = entry.file;
            if (render !== undefined) doc.render = render;
            ops.push(collStatement.replaceOne({ domainId, docId, name: entry.name }, doc, { upsert: true }));
        }
        await Promise.all(ops);
        const removed = existing.filter((r) => !entries.some((e) => e.name === r.name));
        if (removed.length) await collStatement.deleteMany({ domainId, docId, name: { $in: removed.map((r) => r.name) } });
        const $set: Partial<ProblemDoc> = { content: '' };
        const $unset: Partial<Record<Field, '' | true | 1>> = { html: '' };
        await bus.parallel('document/set', domainId, document.TYPE_PROBLEM, docId, $set, $unset);
        $set.content = '';
        delete $set.html;
        delete $unset.content;
        $unset.html = '';
        const result = await document.coll.findOneAndUpdate(
            { domainId, docType: document.TYPE_PROBLEM, docId },
            { $set, $unset },
            { returnDocument: 'after' },
        ) as ProblemDoc;
        if (!result) throw new ProblemNotFoundError(domainId, docId);
        bus.emit('problem/setStatements', domainId, docId, entries);
        return result;
    }

    static async get(
        domainId: string, pid: string | number,
        projection: Projection<ProblemDoc> = ProblemModel.PROJECTION_PUBLIC,
        rawConfig = false,
    ): Promise<ProblemDoc | null> {
        if (Number.isSafeInteger(+pid)) pid = +pid;
        const ddoc = await DomainModel.get(domainId);
        const res = typeof pid === 'number'
            ? await document.get(domainId, document.TYPE_PROBLEM, pid, projection)
            : (await document.getMulti(domainId, document.TYPE_PROBLEM, { sort: sortable(pid, ddoc?.namespaces), pid })
                .project(buildProjection(projection)).limit(1).toArray())[0];
        if (!res) return null;
        try {
            if (!rawConfig && projection.includes('config')) res.config = await parseConfig(res.config, res.data?.map((i) => i.name) || []);
        } catch (e) {
            res.config = `Cannot parse: ${e.message}`;
        }
        return res;
    }

    static getMulti(domainId: string, query: Filter<ProblemDoc>, projection = ProblemModel.PROJECTION_LIST) {
        return document.getMulti(domainId, document.TYPE_PROBLEM, query, projection).sort({ sort: 1 });
    }

    /** @deprecated */
    static async list(
        domainId: string, query: Filter<ProblemDoc>,
        page: number, pageSize: number,
        projection = ProblemModel.PROJECTION_LIST,
    ): Promise<[ProblemDoc[], number, number]> {
        return await db.paginate(
            document.getMulti(domainId, document.TYPE_PROBLEM, query, projection).sort({ sort: 1, docId: 1 }),
            page, pageSize,
        );
    }

    static getStatus(domainId: string, docId: number, uid: number) {
        return document.getStatus(domainId, document.TYPE_PROBLEM, docId, uid);
    }

    static getMultiStatus(domainId: string, query: Filter<ProblemStatusDoc>) {
        return document.getMultiStatus(domainId, document.TYPE_PROBLEM, query);
    }

    static async edit(domainId: string, _id: number, $set: Partial<Omit<ProblemDoc, 'html'>>): Promise<ProblemDoc> {
        const delpid = $set.pid === '';
        const ddoc = await DomainModel.get(domainId);
        const $unset: Partial<Record<Field, '' | true | 1>> = delpid ? { pid: '' } : {};
        if (delpid) {
            delete $set.pid;
            $set.sort = sortable(`P${_id}`, ddoc.namespaces);
        } else if ($set.pid) {
            $set.sort = sortable($set.pid, ddoc.namespaces);
        }
        await bus.parallel('problem/before-edit', $set, $unset);
        const { content, ...metadata } = $set as Partial<ProblemDoc>;
        delete metadata.html;
        delete $unset.content;
        delete $unset.html;
        const entries = typeof content === 'string'
            ? normalizeStatements(content, SystemModel.get('server.language') || 'zh')
            : null;
        const metadataResult = Object.keys(metadata).length || Object.keys($unset).length
            ? await document.set(domainId, document.TYPE_PROBLEM, _id, metadata, $unset)
            : null;
        let reference = metadataResult?.reference;
        if (!metadataResult && entries?.some((entry) => typeof entry.content === 'string'
            && global.Hydro?.module?.contentRenderer?.[entry.name.split('.').pop()]?.compile)) {
            reference = (await document.get(domainId, document.TYPE_PROBLEM, _id, ['reference']))?.reference;
        }
        const result = entries
            ? await ProblemModel.setStatements(domainId, _id, entries, false, reference)
            : metadataResult || await document.get(domainId, document.TYPE_PROBLEM, _id);
        bus.emit('problem/edit', result);
        return result;
    }

    static async copy(domainId: string, _id: number, target: string, pid?: string, hidden?: boolean) {
        const original = await ProblemModel.get(domainId, _id);
        if (!original) throw new ProblemNotFoundError(domainId, _id);
        if (original.reference) throw new ValidationError('reference');
        if (pid && (/^[0-9]+$/.test(pid) || await ProblemModel.get(target, pid))) pid = '';
        if (!pid && original.pid && !await ProblemModel.get(target, original.pid)) pid = original.pid;
        const $set = { hidden: hidden || original.hidden, reference: { domainId, pid: _id } } as any;
        if (typeof original.difficulty === 'number') $set.difficulty = original.difficulty;
        return await ProblemModel.add(
            target, pid, original.title, '',
            original.owner, original.tag, $set,
        );
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

    static count(domainId: string, query: Filter<ProblemDoc>) {
        return document.count(domainId, document.TYPE_PROBLEM, query);
    }

    static async del(domainId: string, docId: number) {
        await bus.parallel('problem/before-del', domainId, docId);
        const res = await Promise.all([
            document.deleteOne(domainId, document.TYPE_PROBLEM, docId),
            document.deleteMultiStatus(domainId, document.TYPE_PROBLEM, { docId }),
            collStatement.deleteMany({ domainId, docId }),
            storage.list(`problem/${domainId}/${docId}/`)
                .then((items) => storage.del(items.map((item) => `problem/${domainId}/${docId}/${item.name}`))),
            bus.parallel('problem/delete', domainId, docId),
        ]);
        return !!res[0][0].deletedCount;
    }

    static async addTestdata(domainId: string, pid: number, name: string, f: Readable | Buffer | string, operator = 1) {
        name = name.trim();
        if (!name) throw new ValidationError('name');
        const [[, fileinfo]] = await Promise.all([
            document.getSub(domainId, document.TYPE_PROBLEM, pid, 'data', name),
            storage.put(`problem/${domainId}/${pid}/testdata/${name}`, f, operator),
        ]);
        const meta = await storage.getMeta(`problem/${domainId}/${pid}/testdata/${name}`);
        if (!meta) throw new FileUploadError();
        const payload = { name, ...pick(meta, ['size', 'lastModified', 'etag']) };
        payload.lastModified ||= new Date();
        if (!fileinfo) await ProblemModel.push(domainId, pid, 'data', { _id: name, ...payload });
        else await document.setSub(domainId, document.TYPE_PROBLEM, pid, 'data', name, payload);
        await bus.emit('problem/addTestdata', domainId, pid, name, payload);
    }

    static async renameTestdata(domainId: string, pid: number, file: string, newName: string, operator = 1) {
        if (file === newName) return;
        const [, sdoc] = await document.getSub(domainId, document.TYPE_PROBLEM, pid, 'data', newName);
        if (sdoc) await ProblemModel.delTestdata(domainId, pid, newName);
        const payload = { _id: newName, name: newName, lastModified: new Date() };
        await Promise.all([
            storage.rename(
                `problem/${domainId}/${pid}/testdata/${file}`,
                `problem/${domainId}/${pid}/testdata/${newName}`,
                operator,
            ),
            document.setSub(domainId, document.TYPE_PROBLEM, pid, 'data', file, payload),
        ]);
        await bus.emit('problem/renameTestdata', domainId, pid, file, newName);
    }

    static async delTestdata(domainId: string, pid: number, name: string | string[], operator = 1) {
        const names = (name instanceof Array) ? name : [name];
        await Promise.all([
            storage.del(names.map((t) => `problem/${domainId}/${pid}/testdata/${t}`), operator),
            ProblemModel.pull(domainId, pid, 'data', names),
        ]);
        await bus.emit('problem/delTestdata', domainId, pid, names);
    }

    static async addAdditionalFile(
        domainId: string, pid: number, name: string,
        f: Readable | Buffer | string, operator = 1, skipUpload = false,
    ) {
        name = name.trim();
        const [[, fileinfo]] = await Promise.all([
            document.getSub(domainId, document.TYPE_PROBLEM, pid, 'additional_file', name),
            skipUpload ? '' : storage.put(`problem/${domainId}/${pid}/additional_file/${name}`, f, operator),
        ]);
        const meta = await storage.getMeta(`problem/${domainId}/${pid}/additional_file/${name}`);
        const payload = { name, ...pick(meta, ['size', 'lastModified', 'etag']) };
        if (!fileinfo) await ProblemModel.push(domainId, pid, 'additional_file', { _id: name, ...payload });
        else await document.setSub(domainId, document.TYPE_PROBLEM, pid, 'additional_file', name, payload);
        await bus.emit('problem/addAdditionalFile', domainId, pid, name, payload);
    }

    static async renameAdditionalFile(domainId: string, pid: number, file: string, newName: string, operator = 1) {
        if (file === newName) return;
        const [, sdoc] = await document.getSub(domainId, document.TYPE_PROBLEM, pid, 'additional_file', newName);
        if (sdoc) await ProblemModel.delAdditionalFile(domainId, pid, newName);
        const payload = { _id: newName, name: newName, lastModified: new Date() };
        await Promise.all([
            storage.rename(
                `problem/${domainId}/${pid}/additional_file/${file}`,
                `problem/${domainId}/${pid}/additional_file/${newName}`,
                operator,
            ),
            document.setSub(domainId, document.TYPE_PROBLEM, pid, 'additional_file', file, payload),
        ]);
        await bus.emit('problem/renameAdditionalFile', domainId, pid, file, newName);
    }

    static async delAdditionalFile(domainId: string, pid: number, name: MaybeArray<string>, operator = 1) {
        const names = (name instanceof Array) ? name : [name];
        await Promise.all([
            storage.del(names.map((t) => `problem/${domainId}/${pid}/additional_file/${t}`), operator),
            ProblemModel.pull(domainId, pid, 'additional_file', names),
        ]);
        await bus.emit('problem/delAdditionalFile', domainId, pid, names);
    }

    static async random(domainId: string, query: Filter<ProblemDoc>) {
        const pcount = await document.count(domainId, document.TYPE_PROBLEM, query);
        if (!pcount) return null;
        const pdoc = await document.getMulti(domainId, document.TYPE_PROBLEM, query)
            .skip(Math.floor(Math.random() * pcount)).limit(1).toArray();
        return pdoc[0].pid || pdoc[0].docId;
    }

    static async getList(
        domainId: string, pids: number[], canViewHidden: number | boolean = false,
        doThrow = true, projection = ProblemModel.PROJECTION_PUBLIC, indexByDocIdOnly = false,
    ): Promise<ProblemDict> {
        if (!pids?.length) return {};
        const r: Record<number, ProblemDoc> = {};
        const l: Record<string, ProblemDoc> = {};
        const q: any = { docId: { $in: pids } };
        const projectionExpr = buildProjection(projection.includes('config') ? [...projection, 'data', 'reference'] : projection);
        let pdocs = await document.getMulti(domainId, document.TYPE_PROBLEM, q)
            .project<ProblemDoc>(projectionExpr).toArray();
        if (canViewHidden !== true) {
            pdocs = pdocs.filter((i) => i.owner === canViewHidden || i.maintainer?.includes(canViewHidden as any) || !i.hidden);
        }
        await Promise.all(pdocs.map(async (pdoc) => {
            if (projection.includes('config')) {
                if (pdoc.reference) {
                    const src = await ProblemModel.get(pdoc.reference.domainId, pdoc.reference.pid);
                    pdoc.config = src ? src.config : 'Cannot find source problem';
                } else {
                    try {
                        pdoc.config = await parseConfig(pdoc.config as string, pdoc.data?.map((i) => i.name) || []);
                    } catch (e) {
                        pdoc.config = `Cannot parse: ${e.message}`;
                    }
                }
            }
            if (!projection.includes('data')) delete pdoc.data;
            if (!projection.includes('reference')) delete pdoc.reference;
            r[pdoc.docId] = pdoc;
            if (pdoc.pid) l[pdoc.pid] = pdoc;
        }));
        // TODO enhance
        if (pdocs.length !== pids.length) {
            for (const pid of pids) {
                if (!r[pid] && !l[pid]) {
                    if (doThrow) throw new ProblemNotFoundError(domainId, pid);
                    if (!indexByDocIdOnly) r[pid] = { ...ProblemModel.default, domainId, pid: pid.toString() };
                }
            }
        }
        return indexByDocIdOnly ? r : Object.assign(r, l);
    }

    static async getListStatus(domainId: string, uid: number, pids: number[]) {
        const psdocs = await ProblemModel.getMultiStatus(
            domainId, { uid, docId: { $in: Array.from(new Set(pids)) } },
        ).toArray();
        return keyBy(psdocs, 'docId');
    }

    static async updateStatus(
        domainId: string, pid: number, uid: number,
        rid: ObjectId, status: number, score: number,
    ) {
        const condition = status === STATUS.STATUS_ACCEPTED ? {}
            : { $or: [{ status: { $ne: STATUS.STATUS_ACCEPTED } }, { rid }] };
        const res = await document.setStatusIfCondition(
            domainId, document.TYPE_PROBLEM, pid, uid,
            condition, { rid, status, score },
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
        return true;
    }

    static async import(domainId: string, filepath: string, options: ProblemImportOptions = {}) {
        let tmpdir = '';
        if (typeof options !== 'object') {
            logger.warn('ProblemModel.import: options should be an object');
            options = {};
        }
        const {
            preferredPrefix, progress, override = false, operator = 1,
        } = options;
        let delSource = options.delSource;
        let problems: string[];
        const ddoc = await DomainModel.get(domainId);
        if (!ddoc) throw new NotFoundError(domainId);
        try {
            if (filepath.endsWith('.zip')) {
                tmpdir = path.join(os.tmpdir(), 'hydro', `${Math.random()}.import`);
                const zip = new ZipReader(Readable.toWeb(fs.createReadStream(filepath)));
                let entries: Entry[];
                try {
                    entries = await zip.getEntries();
                } catch (e) {
                    throw new ValidationError('zip', null, e.message);
                }
                delSource = true;
                await extractZip(entries, tmpdir);
            } else if (fs.statSync(filepath).isDirectory()) {
                tmpdir = filepath;
            } else {
                throw new ValidationError('file', null, 'Invalid file');
            }
            const files = await fs.readdir(tmpdir, { withFileTypes: true });
            if (files.find((f) => f.name === 'problem.yaml')) {
                problems = ['.']; // special case for ICPC problem package
            } else {
                problems = files.filter((f) => f.isDirectory()).map((i) => i.name);
            }
        } catch (e) {
            if (delSource) await fs.remove(tmpdir);
            throw e;
        }
        for (const i of problems) {
            try {
                const files = await fs.readdir(path.join(tmpdir, i), { withFileTypes: true });
                if (!files.find((f) => f.name === 'problem.yaml')) continue;
                if (process.env.HYDRO_CLI) logger.info(`Importing problem ${i}`);
                const content = fs.readFileSync(path.join(tmpdir, i, 'problem.yaml'), 'utf-8');
                const pdoc: ProblemDoc = yaml.load(content) as any;
                if (!pdoc) {
                    if (process.env.HYDRO_CLI) logger.error(`Invalid problem.yaml ${i}`);
                    continue;
                }
                let pid = pdoc.pid;
                let overridePid = null;

                const isValidPid = async (id: string) => {
                    if (!(/^(?:[a-z0-9]{1,10}-)?[a-z][0-9a-z]*$/i.test(id))) return false;
                    if (id.includes('-')) {
                        const [prefix] = id.split('-');
                        if (!ddoc?.namespaces?.[prefix]) return false;
                    }
                    const doc = await ProblemModel.get(ddoc._id, id);
                    if (doc) {
                        if (!override) return false;
                        overridePid = doc.docId;
                        return true;
                    }
                    return true;
                };
                const getFiles = async (...type: string[]): Promise<[fs.Dirent, string][]> => {
                    if (type.length > 1) {
                        let result = [];
                        for (const t of type) result = result.concat(await getFiles(t));
                        return result;
                    }
                    const [t] = type;
                    if (!files.find((f) => f.name === t && f.isDirectory())) return [];
                    const rs = await fs.readdir(path.join(tmpdir, i, t), { withFileTypes: true });
                    return rs.map((r) => [r, path.join(tmpdir, i, t, r.name)] as [fs.Dirent, string]);
                };

                if (pid) {
                    if (preferredPrefix) {
                        const newPid = pid.replace(/^[A-Za-z]+/, preferredPrefix);
                        if (await isValidPid(newPid)) pid = newPid;
                    }
                    if (!await isValidPid(pid)) pid = undefined;
                }
                const hasStatements = Object.hasOwn(pdoc, 'statements');
                const manifest = (pdoc as ProblemDoc & { statements?: unknown }).statements;
                const statements: StatementEntry[] = [];
                const sources = new Set<string>();
                if (hasStatements) {
                    if (!Array.isArray(manifest)) throw new ValidationError('statements');
                    const names = new Set<string>();
                    const additionalFiles = await getFiles('additional_file');
                    for (const entry of manifest) {
                        if (!entry || typeof entry !== 'object' || Array.isArray(entry)) throw new ValidationError('statement.entry');
                        if (typeof entry.name !== 'string' || entry.name.trim() !== entry.name
                            || !/^\w[\w .()-]*\.[A-Za-z0-9]{1,16}$/.test(entry.name)) {
                            throw new ValidationError('statement.name');
                        }
                        if (names.has(entry.name)) throw new ValidationError('statement.duplicate', null, entry.name);
                        names.add(entry.name);
                        if (typeof entry.lang !== 'string' || !entry.lang) throw new ValidationError('statement.lang', null, entry.name);
                        const isSource = Object.hasOwn(entry, 'source');
                        if (isSource === Object.hasOwn(entry, 'file')) throw new ValidationError('statement.entry', null, entry.name);
                        const filename = isSource ? entry.source : entry.file;
                        if (typeof filename !== 'string' || !filename || filename.trim() !== filename
                            || /[/\\\0]/.test(filename) || ['.', '..'].includes(filename)
                            || path.isAbsolute(filename) || path.win32.isAbsolute(filename)
                            || (isSource && filename === 'problem.yaml')) {
                            throw new ValidationError('statement.file', null, entry.name);
                        }
                        if (!isSource && !additionalFiles.some(([f]) => f.name === filename && f.isFile())) {
                            throw new ValidationError('statement.file', null, filename);
                        }
                        const location = path.join(tmpdir, i, ...(isSource ? [] : ['additional_file']), filename);
                        const stat = await fs.lstat(location).catch(() => null);
                        if (!stat?.isFile()) throw new ValidationError('statement.file', null, filename);
                        if (isSource) sources.add(filename);
                        statements.push({ name: entry.name, lang: entry.lang, ...(!isSource ? { file: filename } : {}) });
                    }
                }
                let overrideContent: string = null;
                if (!hasStatements) {
                    overrideContent = findOverrideContent(path.join(tmpdir, i), 'problem');
                    overrideContent ??= findOverrideContent(path.join(tmpdir, i, 'statement'), 'problem');
                    overrideContent ??= findOverrideContent(path.join(tmpdir, i, 'problem_statement'), 'problem');
                }
                if (pdoc.difficulty && !Number.isSafeInteger(pdoc.difficulty)) delete pdoc.difficulty;
                const title = pdoc.title || (pdoc as any).name;
                if (typeof title !== 'string') throw new ValidationError('title', null, 'Invalid title');
                const allFiles = await getFiles(
                    'testdata', 'additional_file',
                    // The following is from https://icpc.io/problem-package-format/spec/2023-07-draft.html
                    'attachments', 'generators', 'include', 'data', 'statement', 'problem_statement',
                );
                const sourceFiles = Array.from(sources, (name) => path.join(tmpdir, i, name));
                const totalSize = [...allFiles.map((f) => f[1]), ...sourceFiles]
                    .map((loc) => fs.statSync(loc).size).reduce((a, b) => a + b, 0);
                if (allFiles.length + sources.size > SystemModel.get('limit.problem_files')) {
                    throw new ValidationError('files', null, 'Too many files');
                }
                if (totalSize > SystemModel.get('limit.problem_files_size')) throw new ValidationError('files', null, 'Files too large');
                if (hasStatements) {
                    for (const [index, entry] of (manifest as any[]).entries()) {
                        if (Object.hasOwn(entry, 'source')) {
                            statements[index].content = await fs.readFile(path.join(tmpdir, i, entry.source), 'utf8');
                        }
                    }
                } else {
                    statements.push(...normalizeStatements(
                        overrideContent ?? pdoc.content?.toString() ?? 'No content', SystemModel.get('server.language') || 'zh', pdoc.html,
                    ));
                }
                const tag = (pdoc.tag || []).map((t) => t.toString());
                let configChanged = false;
                let config: ProblemConfigFile = {};
                if (await fs.exists(path.join(tmpdir, i, 'testdata/config.yaml'))) {
                    try {
                        config = yaml.load(await fs.readFile(path.join(tmpdir, i, 'testdata/config.yaml'), 'utf-8'));
                    } catch (e) {
                        // TODO: report this as a warning
                    }
                }
                if (await fs.exists(path.join(tmpdir, i, 'domjudge-problem.ini'))) {
                    const djConfig = (await fs.readFile(path.join(tmpdir, i, 'domjudge-problem.ini'), 'utf-8') as string)
                        .split('\n').map((line: string) => line.split('=').map((lines: string) => lines.trim()));
                    const djConfigJson: any = {};
                    for (const [key, value] of djConfig) {
                        djConfigJson[key] = value;
                    }
                    if (djConfigJson.timelimit) {
                        config.time = `${djConfigJson.timelimit * 1000}ms`;
                        configChanged = true;
                    }
                    if (djConfigJson.externalid) pid = djConfigJson.externalid;
                }
                if ((pdoc as any).limits) {
                    config.time = (pdoc as any).limits.time_limit ? `${(pdoc as any).limits.time_limit * 1000}ms` : config.time || undefined;
                    config.memory = (pdoc as any).limits.memory ? `${(pdoc as any).limits.memory}m` : config.memory || undefined;
                    configChanged = true;
                }
                const docId = overridePid || await ProblemModel.add(
                    ddoc._id, pid, title.trim(), '',
                    operator || pdoc.owner, tag, { hidden: options.hidden || pdoc.hidden, difficulty: pdoc.difficulty },
                );
                // TODO delete unused file when updating pdoc
                for (const [f, loc] of await getFiles('testdata', 'attachments', 'generators', 'include')) {
                    if (f.isDirectory()) {
                        const sub = await fs.readdir(loc);
                        for (const s of sub) await ProblemModel.addTestdata(ddoc._id, docId, s, path.join(loc, s));
                    } else if (f.isFile()) await ProblemModel.addTestdata(domainId, docId, f.name, loc);
                }
                for (const [f, loc] of await getFiles('data')) {
                    if (!f.isDirectory()) continue;
                    const sub = await fs.readdir(loc);
                    for (const file of sub) {
                        if (!hasStatements && f.name === 'sample') await ProblemModel.addAdditionalFile(domainId, docId, file, path.join(loc, file));
                        await ProblemModel.addTestdata(ddoc._id, docId, file, path.join(loc, file));
                    }
                }
                for (const [f, loc] of await getFiles('output_validators')) {
                    if (f.isFile()) continue;
                    const sub = await fs.readdir(loc);
                    for (const file of sub) {
                        if (file === 'testlib.h') continue;
                        await ProblemModel.addTestdata(ddoc._id, docId, file, path.join(loc, file));
                        if (f.name === 'checker') {
                            config.checker_type = 'testlib';
                            config.checker = file;
                        } else if (f.name === 'interactor') {
                            config.type = ProblemType.Interactive;
                            config.interactor = file;
                        }
                        configChanged = true;
                    }
                }
                for (const [f, loc] of await getFiles(...(hasStatements
                    ? ['additional_file'] : ['additional_file', 'attachments', 'statement', 'problem_statement']))) {
                    if (!f.isFile()) continue;
                    await ProblemModel.addAdditionalFile(ddoc._id, docId, f.name, loc);
                }
                await ProblemModel.setStatements(ddoc._id, docId, statements, true);
                await ProblemModel.edit(ddoc._id, docId, {
                    title: title.trim(),
                    tag,
                    difficulty: pdoc.difficulty,
                    ...(options.hidden ? { hidden: true } : {}),
                });
                for (const [f, loc] of await getFiles('solution')) {
                    if (!f.isFile()) continue;
                    await SolutionModel.add(ddoc._id, docId, operator, await fs.readFile(loc, 'utf-8'));
                }
                for (const [f] of await getFiles('attachments', 'include')) {
                    if (!f.isFile()) continue;
                    config.user_extra_files ||= [];
                    config.user_extra_files = Array.from(new Set(config.user_extra_files.concat(f.name)));
                    config.judge_extra_files ||= [];
                    config.judge_extra_files = Array.from(new Set(config.judge_extra_files.concat(f.name)));
                    configChanged = true;
                }
                if (configChanged) await ProblemModel.addTestdata(ddoc._id, docId, 'config.yaml', Buffer.from(yaml.dump(config)));
                let count = 0;
                for (const [f, loc] of await getFiles('std')) {
                    if (!f.isFile()) continue;
                    count++;
                    if (count > 5) continue;
                    await RecordModel.add(ddoc._id, docId, operator, f.name.split('.')[1], await fs.readFile(loc, 'utf-8'), true);
                }
                for (const [f, loc] of await getFiles('submissions')) {
                    if (f.isFile()) continue;
                    const sub = await fs.readdir(loc);
                    for (const file of sub) {
                        if (file.endsWith('.zip')) continue;
                        const code = await fs.readFile(path.join(loc, file), 'utf-8');
                        await RecordModel.add(ddoc._id, docId, operator, file.split('.')[1], `// ${file}: ${loc}\n${code}`, true);
                    }
                }
                if (configChanged) await ProblemModel.addTestdata(ddoc._id, docId, 'config.yaml', Buffer.from(yaml.dump(config)));
                const message = `${overridePid ? 'Updated' : 'Imported'} problem ${pdoc.pid || docId} (${title})`;
                (process.env.HYDRO_CLI ? logger.info : progress)?.(message);
            } catch (e) {
                (process.env.HYDRO_CLI ? logger.info : progress)?.(`Error importing problem ${i}: ${e.message}`);
            }
        }
        if (delSource) await fs.remove(tmpdir);
    }

    static async export(domainId: string, pidFilter = '') {
        console.log('Exporting problems...');
        const tmpdir = path.join(os.tmpdir(), 'hydro', `${Math.random()}.export`);
        await fs.mkdir(tmpdir);
        const pdocs = await ProblemModel.getMulti(
            domainId, pidFilter ? { pid: new RegExp(pidFilter) } : {},
            ProblemModel.PROJECTION_PUBLIC,
        ).toArray();
        if (process.env.HYDRO_CLI) logger.info(`Exporting ${pdocs.length} problems`);
        for (const pdoc of pdocs) {
            if (process.env.HYDRO_CLI) logger.info(`Exporting problem ${pdoc.pid || (`P${pdoc.docId}`)} (${pdoc.title})`);
            const problemPath = path.join(tmpdir, `${pdoc.docId}`);
            await fs.mkdir(problemPath);
            const problemYaml = path.join(problemPath, 'problem.yaml');
            const statements = await ProblemModel.getStatements(pdoc);
            let filePdoc = pdoc;
            if (pdoc.reference) {
                filePdoc = await ProblemModel.get(pdoc.reference.domainId, pdoc.reference.pid, ['domainId', 'docId', 'data', 'additional_file']);
                if (!filePdoc) throw new ProblemNotFoundError(pdoc.reference.domainId, pdoc.reference.pid);
            }
            const manifest = statements.map((s) => {
                if (/[/\\\0]/.test(s.name)) throw new ValidationError('statement.name', null, s.name);
                if (s.file && !filePdoc.additional_file?.some((f) => f.name === s.file)) {
                    throw new ValidationError('statement.file', null, s.file);
                }
                return {
                    name: s.name,
                    lang: s.lang,
                    ...(s.file ? { file: s.file } : { source: `statement_${s.name}` }),
                };
            });
            const problemYamlContent = yaml.dump({
                pid: pdoc.pid || `P${pdoc.docId}`,
                owner: pdoc.owner,
                title: pdoc.title,
                tag: pdoc.tag,
                nSubmit: pdoc.nSubmit,
                nAccept: pdoc.nAccept,
                difficulty: pdoc.difficulty,
                statements: manifest,
            });
            await fs.writeFile(problemYaml, problemYamlContent);
            for (const s of statements) {
                if (!s.file) await fs.writeFile(path.join(problemPath, `statement_${s.name}`), s.content ?? '', 'utf8');
            }
            if ((filePdoc.data || []).length) {
                const testdataPath = path.join(problemPath, 'testdata');
                await fs.mkdir(testdataPath);
                for (const file of filePdoc.data) {
                    const stream = await storage.get(`problem/${filePdoc.domainId}/${filePdoc.docId}/testdata/${file.name}`);
                    const buf = await streamToBuffer(stream);
                    const testdataFile = path.join(testdataPath, file.name);
                    await fs.writeFile(testdataFile, buf);
                }
            }
            if ((filePdoc.additional_file || []).length) {
                const additionalPath = path.join(problemPath, 'additional_file');
                await fs.mkdir(additionalPath);
                for (const file of filePdoc.additional_file) {
                    const stream = await storage.get(`problem/${filePdoc.domainId}/${filePdoc.docId}/additional_file/${file.name}`);
                    const buf = await streamToBuffer(stream);
                    const additionalFile = path.join(additionalPath, file.name);
                    await fs.writeFile(additionalFile, buf);
                }
            }
        }
        const target = `${process.cwd()}/problem-${domainId}-${new Date().toISOString().replace(':', '-').split(':')[0]}.zip`;
        const res = child.spawnSync('zip', ['-r', target, '.'], { cwd: tmpdir, stdio: 'inherit' });
        if (res.error) throw res.error;
        if (res.status) throw new Error(`Error: Exited with code ${res.status}`);
        const stat = fs.statSync(target);
        console.log(`Domain ${domainId} problems export saved at ${target} , size: ${size(stat.size)}`);
    }
}

export async function apply(ctx: Context) {
    ctx.on('problem/addTestdata', async (domainId, docId, name) => {
        if (!['config.yaml', 'config.yml', 'Config.yaml', 'Config.yml'].includes(name)) return;
        const buf = await storage.get(`problem/${domainId}/${docId}/testdata/${name}`);
        await ProblemModel.edit(domainId, docId, { config: (await streamToBuffer(buf)).toString() });
    });
    ctx.on('problem/delTestdata', async (domainId, docId, names) => {
        if (!names.includes('config.yaml')) return;
        await ProblemModel.edit(domainId, docId, { config: '' });
    });
    ctx.on('problem/renameTestdata', async (domainId, docId, file, newName) => {
        if (['config.yaml', 'config.yml', 'Config.yaml', 'Config.yml'].includes(file)) {
            await ProblemModel.edit(domainId, docId, { config: '' });
        }
        if (['config.yaml', 'config.yml', 'Config.yaml', 'Config.yml'].includes(newName)) {
            const buf = await storage.get(`problem/${domainId}/${docId}/testdata/${newName}`);
            await ProblemModel.edit(domainId, docId, { config: (await streamToBuffer(buf)).toString() });
        }
    });
    await db.ensureIndexes(
        collStatement,
        { key: { domainId: 1, docId: 1, name: 1 }, name: 'basic', unique: true },
    );
}

global.Hydro.model.problem = ProblemModel;
export default ProblemModel;
