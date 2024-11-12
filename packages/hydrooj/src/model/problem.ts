/* eslint-disable no-await-in-loop */
import child from 'child_process';
import os from 'os';
import path from 'path';
import AdmZip from 'adm-zip';
import fs from 'fs-extra';
import yaml from 'js-yaml';
import { pick } from 'lodash';
import { Filter, ObjectId } from 'mongodb';
import type { Readable } from 'stream';
import { Logger, size, streamToBuffer } from '@hydrooj/utils/lib/utils';
import { Context } from '../context';
import { FileUploadError, ProblemNotFoundError, ValidationError } from '../error';
import type {
    Document, LocalizedContent, ProblemConfigFile, ProblemDict, ProblemStatusDoc, User,
} from '../interface';
import { parseConfig } from '../lib/testdataConfig';
import * as bus from '../service/bus';
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
import * as SystemModel from './system';

export interface ProblemDoc extends Document { }
export type Field = keyof ProblemDoc;

const logger = new Logger('problem');
function sortable(source: string, namespaces: Record<string, string>) {
    const [namespace, pid] = source.includes('-') ? source.split('-') : ['default', source];
    return ((namespaces ? `${namespaces[namespace]}-` : '') + pid)
        .replace(/(\d+)/g, (str) => (str.length >= 6 ? str : ('0'.repeat(6 - str.length) + str)));
}

function findOverrideContent(dir: string, base: string) {
    let files = fs.readdirSync(dir);
    if (files.includes(`${base}.md`)) return fs.readFileSync(path.join(dir, `${base}.md`), 'utf8');
    if (files.includes(`${base}.pdf`)) return `@[PDF](file://${base}.pdf)`;
    const languages = {};
    files = files.filter((i) => new RegExp(`^${base}(?:_|.)([a-zA-Z_]+)\\.(md|pdf)$`).test(i));
    if (!files.length) return null;
    for (const file of files) {
        const match = file.match(`^${base}(?:_|.)([a-zA-Z_]+)\\.(md|pdf)$`);
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
}

interface ProblemCreateOptions {
    difficulty?: number;
    hidden?: boolean;
    reference?: { domainId: string, pid: number };
}

export class ProblemModel {
    static PROJECTION_CONTEST_LIST: Field[] = [
        '_id', 'domainId', 'docType', 'docId', 'pid',
        'owner', 'title',
    ];

    static PROJECTION_LIST: Field[] = [
        ...ProblemModel.PROJECTION_CONTEST_LIST,
        'nSubmit', 'nAccept', 'difficulty', 'tag', 'hidden',
        'stats',
    ];

    static PROJECTION_CONTEST_DETAIL: Field[] = [
        ...ProblemModel.PROJECTION_CONTEST_LIST,
        'content', 'html', 'data', 'config', 'additional_file',
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
        content: [],
        html: false,
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
        content: [],
        html: false,
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
        domainId: string, pid: string = '', title: string,
        content: { content?: string, from?: string, lang: string, name: string }[] | string,
        owner: number, tag: string[] = [], meta: ProblemCreateOptions = {},
    ) {
        let c: LocalizedContent;
        if (typeof content === 'string') {
            c.push({ id: await document.addContent(content), name: 'default', lang: 'en' });
        } else {
            for (const entry of content) {
                if (entry.from) {
                    c.push(entry as any);
                } else {
                    const id = await document.addContent(entry.content);
                    c.push({ id, name: entry.name, lang: entry.lang });
                }
            }
        }
        const [doc] = await ProblemModel.getMulti(domainId, {})
            .sort({ docId: -1 }).limit(1).project({ docId: 1 })
            .toArray();
        const result = await ProblemModel.addWithId(
            domainId, (doc?.docId || 0) + 1, pid,
            title, c, owner, tag, meta,
        );
        return result;
    }

    static async addWithId(
        domainId: string, docId: number, pid: string = '', title: string,
        content: ProblemDoc['content'], owner: number, tag: string[] = [],
        meta: ProblemCreateOptions = {},
    ) {
        const ddoc = await DomainModel.get(domainId);
        const args: Partial<ProblemDoc> = {
            title, tag, hidden: meta.hidden || false, nSubmit: 0, nAccept: 0, sort: sortable(pid || `P${docId}`, ddoc?.namespaces),
        };
        if (pid) args.pid = pid;
        if (meta.difficulty) args.difficulty = meta.difficulty;
        if (meta.reference) args.reference = meta.reference;
        await bus.parallel('problem/before-add', domainId, content, owner, docId, args);
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
        const ddoc = await DomainModel.get(domainId);
        const res = typeof pid === 'number'
            ? await document.get(domainId, document.TYPE_PROBLEM, pid, projection)
            : (await document.getMulti(domainId, document.TYPE_PROBLEM, { sort: sortable(pid, ddoc?.namespaces), pid })
                .project(buildProjection(projection)).limit(1).toArray())[0];
        if (!res) return null;
        try {
            if (!rawConfig) res.config = await parseConfig(res.config);
        } catch (e) {
            res.config = `Cannot parse: ${e.message}`;
        }
        return res;
    }

    static async getContent(contentIds: string[]) {
        const content = await document.getContents(contentIds);
        return Object.fromEntries(content.map((i) => [i._id.toString(), i.content]));
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

    static async edit(
        domainId: string, _id: number,
        $set: (Partial<ProblemDoc> & ({ content?: { content: string }[] })),
    ): Promise<ProblemDoc> {
        const delpid = $set.pid === '';
        const ddoc = await DomainModel.get(domainId);
        if (delpid) {
            delete $set.pid;
            $set.sort = sortable(`P${_id}`, ddoc.namespaces);
        } else if ($set.pid) {
            $set.sort = sortable($set.pid, ddoc.namespaces);
        }
        await bus.parallel('problem/before-edit', $set);
        if ($set.content) {
            const update = $set.content instanceof Array ? $set.content : [{ content: $set.content, lang: 'en', name: 'default' }];
            const existing = await document.get(domainId, document.TYPE_PROBLEM, _id);
            if (!existing) throw new ProblemNotFoundError(domainId, _id);
            const contents = existing.content;
            const final = [];
            for (const entry of update) {
                if ('id' in entry && contents.find((i) => i.id === entry.id)) {
                    await document.setContent(entry.id, entry.content);
                    final.push({ id: entry.id, name: entry.name, lang: entry.lang });
                } else {
                    const cid = await document.addContent(entry.content);
                    final.push({ id: cid, name: entry.name, lang: entry.lang });
                }
            }
            $set.content = final;
        }
        const result = await document.set(domainId, document.TYPE_PROBLEM, _id, $set, delpid ? { pid: '' } : undefined);
        await bus.emit('problem/edit', result);
        return result;
    }

    static async copy(domainId: string, _id: number, target: string, pid?: string) {
        const original = await ProblemModel.get(domainId, _id);
        if (!original) throw new ProblemNotFoundError(domainId, _id);
        if (original.reference) throw new ValidationError('reference');
        if (pid && (/^[0-9]+$/.test(pid) || await ProblemModel.get(target, pid))) pid = '';
        if (!pid && original.pid && !await ProblemModel.get(target, original.pid)) pid = original.pid;
        return await ProblemModel.add(
            target, pid, original.title, original.content.map((i) => ({ name: i.name, lang: i.lang, from: 'id' in i ? i.id : i.from })),
            original.owner, original.tag, { hidden: original.hidden, reference: { domainId, pid: _id } },
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
            storage.list(`problem/${domainId}/${docId}/`)
                .then((items) => storage.del(items.map((item) => `problem/${domainId}/${docId}/${item.name}`))),
            bus.parallel('problem/delete', domainId, docId),
        ]);
        await bus.emit('problem/del', domainId, docId);
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
        let pdocs = await document.getMulti(domainId, document.TYPE_PROBLEM, q)
            .project<ProblemDoc>(buildProjection(projection)).toArray();
        if (canViewHidden !== true) {
            pdocs = pdocs.filter((i) => i.owner === canViewHidden || i.maintainer?.includes(canViewHidden as any) || !i.hidden);
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
        rid: ObjectId, status: number, score: number,
    ) {
        const filter: Filter<ProblemStatusDoc> = { rid: { $ne: rid }, status: STATUS.STATUS_ACCEPTED };
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
        let problems: string[];
        try {
            if (filepath.endsWith('.zip')) {
                tmpdir = path.join(os.tmpdir(), 'hydro', `${Math.random()}.import`);
                let zip: AdmZip;
                try {
                    zip = new AdmZip(filepath);
                } catch (e) {
                    throw new ValidationError('zip', null, e.message);
                }
                await new Promise((resolve, reject) => {
                    zip.extractAllToAsync(tmpdir, true, (err) => {
                        if (err) reject(err);
                        resolve(null);
                    });
                });
            } else if (fs.statSync(filepath).isDirectory()) {
                tmpdir = filepath;
            } else {
                throw new ValidationError('file', null, 'Invalid file');
            }
            const files = await fs.readdir(tmpdir, { withFileTypes: true });
            problems = files.filter((f) => f.isDirectory()).map((i) => i.name);
        } catch (e) {
            if (options.delSource) await fs.remove(tmpdir);
        }
        for (const i of problems) {
            try {
                if (process.env.HYDRO_CLI) logger.info(`Importing problem ${i}`);
                const files = await fs.readdir(path.join(tmpdir, i), { withFileTypes: true });
                if (!files.find((f) => f.name === 'problem.yaml')) continue;
                const content = fs.readFileSync(path.join(tmpdir, i, 'problem.yaml'), 'utf-8');
                const pdoc: ProblemDoc = yaml.load(content) as any;
                if (!pdoc) continue;
                let pid = pdoc.pid;
                let overridePid = null;

                const isValidPid = async (id: string) => {
                    if (!(/^[A-Za-z]+[0-9A-Za-z]*$/.test(id))) return false;
                    const doc = await ProblemModel.get(domainId, id);
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
                let overrideContent = findOverrideContent(path.join(tmpdir, i), 'problem');
                overrideContent ||= findOverrideContent(path.join(tmpdir, i, 'statement'), 'problem');
                overrideContent ||= findOverrideContent(path.join(tmpdir, i, 'problem_statement'), 'problem');
                if (pdoc.difficulty && !Number.isSafeInteger(pdoc.difficulty)) delete pdoc.difficulty;
                const title = pdoc.title || (pdoc as any).name;
                if (typeof title !== 'string') throw new ValidationError('title', null, 'Invalid title');
                const allFiles = await getFiles(
                    'testdata', 'additional_file',
                    // The following is from https://icpc.io/problem-package-format/spec/2023-07-draft.html
                    'attachments', 'generators', 'include', 'data', 'statement', 'problem_statement',
                );
                const totalSize = allFiles.map((f) => fs.statSync(f[1]).size).reduce((a, b) => a + b, 0);
                if (allFiles.length > SystemModel.get('limit.problem_files')) throw new ValidationError('files', null, 'Too many files');
                if (totalSize > SystemModel.get('limit.problem_files_size')) throw new ValidationError('files', null, 'Files too large');
                const tag = (pdoc.tag || []).map((t) => t.toString());
                let configChanged = false;
                let config: ProblemConfigFile = {};
                if (await fs.exists('testdata/config.yaml')) {
                    try {
                        config = yaml.load(await fs.readFile('testdata/config.yaml', 'utf-8'));
                    } catch (e) {
                        // TODO: report this as a warning
                    }
                }
                if ((pdoc as any).limits) {
                    config.time = (pdoc as any).limits.time_limit;
                    config.memory = (pdoc as any).limits.memory;
                }
                const docId = overridePid
                    ? (await ProblemModel.edit(domainId, overridePid, {
                        title: pdoc.title.trim(),
                        content: [{
                            id: '', name: 'default', content: overrideContent || pdoc.content.toString() || 'No content', lang: 'en',
                        }],
                        tag,
                        difficulty: pdoc.difficulty,
                    })).docId
                    : await ProblemModel.add(
                        domainId, pid, title.trim(), overrideContent || pdoc.content?.toString() || 'No content',
                        operator || pdoc.owner, tag, { hidden: pdoc.hidden, difficulty: pdoc.difficulty },
                    );
                // TODO delete unused file when updating pdoc
                for (const [f, loc] of await getFiles('testdata', 'attachments', 'generators', 'include')) {
                    if (f.isDirectory()) {
                        const sub = await fs.readdir(loc);
                        for (const s of sub) await ProblemModel.addTestdata(domainId, docId, s, path.join(loc, s));
                    } else if (f.isFile()) await ProblemModel.addTestdata(domainId, docId, f.name, loc);
                }
                for (const [f, loc] of await getFiles('data')) {
                    if (!f.isDirectory()) continue;
                    const sub = await fs.readdir(loc);
                    for (const file of sub) {
                        await (f.name === 'sample' ? ProblemModel.addAdditionalFile
                            : f.name === 'secret' ? ProblemModel.addTestdata
                                : null)?.(domainId, docId, file, path.join(loc, file));
                    }
                }
                for (const [f, loc] of await getFiles('additional_file', 'attachments', 'statement', 'problem_statement')) {
                    if (!f.isFile()) continue;
                    await ProblemModel.addAdditionalFile(domainId, docId, f.name, loc);
                }
                for (const [f, loc] of await getFiles('solution')) {
                    if (!f.isFile()) continue;
                    await SolutionModel.add(domainId, docId, operator, await fs.readFile(loc, 'utf-8'));
                }
                for (const [f] of await getFiles('attachments', 'include')) {
                    if (!f.isFile()) continue;
                    config.user_extra_files ||= [];
                    config.user_extra_files = Array.from(new Set(config.user_extra_files.concat(f.name)));
                    config.judge_extra_files ||= [];
                    config.judge_extra_files = Array.from(new Set(config.judge_extra_files.concat(f.name)));
                    configChanged = true;
                }
                let count = 0;
                for (const [f, loc] of await getFiles('std')) {
                    if (!f.isFile()) continue;
                    count++;
                    if (count > 5) continue;
                    await RecordModel.add(domainId, docId, operator, f.name.split('.')[1], await fs.readFile(loc, 'utf-8'), true);
                }
                if (configChanged) await ProblemModel.addTestdata(domainId, docId, 'config.yaml', yaml.dump(config));
                const message = `${overridePid ? 'Updated' : 'Imported'} problem ${pdoc.pid || docId} (${title})`;
                (process.env.HYDRO_CLI ? logger.info : progress)?.(message);
            } catch (e) {
                (process.env.HYDRO_CLI ? logger.info : progress)?.(`Error importing problem ${i}: ${e.message}`);
            }
        }
        if (options.delSource) await fs.remove(tmpdir);
    }

    static async export(domainId: string) {
        console.log('Exporting problems...');
        const tmpdir = path.join(os.tmpdir(), 'hydro', `${Math.random()}.export`);
        await fs.mkdir(tmpdir);
        const pdocs = await ProblemModel.getMulti(domainId, {}, ProblemModel.PROJECTION_PUBLIC).toArray();
        for (const pdoc of pdocs) {
            if (process.env.HYDRO_CLI) logger.info(`Exporting problem ${pdoc.pid || (`P${pdoc.docId}`)} (${pdoc.title})`);
            const problemPath = path.join(tmpdir, `${pdoc.docId}`);
            await fs.mkdir(problemPath);
            const problemYaml = path.join(problemPath, 'problem.yaml');
            const problemYamlContent = yaml.dump({
                pid: pdoc.pid || `P${pdoc.docId}`,
                owner: pdoc.owner,
                title: pdoc.title,
                tag: pdoc.tag,
                nSubmit: pdoc.nSubmit,
                nAccept: pdoc.nAccept,
                difficulty: pdoc.difficulty,
            });
            const [c] = await Promise.all([
                ProblemModel.getContent(pdoc.content.map((i) => ('id' in i ? i.id : i.from))),
                fs.writeFile(problemYaml, problemYamlContent),
            ]);
            for (const i of pdoc.content) {
                await fs.writeFile(path.join(problemPath, `problem_${'id' in i ? i.id : i.from}.md`), [
                    '---',
                    yaml.dump({
                        name: i.name,
                        lang: i.lang,
                    }),
                    '---',
                    c['id' in i ? i.id : i.from],
                ].join('\n'));
            }
            if ((pdoc.data || []).length) {
                const testdataPath = path.join(problemPath, 'testdata');
                await fs.mkdir(testdataPath);
                for (const file of pdoc.data) {
                    const stream = await storage.get(`problem/${domainId}/${pdoc.docId}/testdata/${file.name}`);
                    const buf = await streamToBuffer(stream);
                    const testdataFile = path.join(testdataPath, file.name);
                    await fs.writeFile(testdataFile, buf);
                }
            }
            if ((pdoc.additional_file || []).length) {
                const additionalPath = path.join(problemPath, 'additional_file');
                await fs.mkdir(additionalPath);
                for (const file of pdoc.additional_file) {
                    const stream = await storage.get(`problem/${domainId}/${pdoc.docId}/additional_file/${file.name}`);
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

export function apply(ctx: Context) {
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
}

global.Hydro.model.problem = ProblemModel;
export default ProblemModel;
