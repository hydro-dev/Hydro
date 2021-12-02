import AdmZip from 'adm-zip';
import { statSync } from 'fs-extra';
import { flatten, intersection, isSafeInteger } from 'lodash';
import { lookup } from 'mime-types';
import { FilterQuery, ObjectID } from 'mongodb';
import { sortFiles } from '@hydrooj/utils/lib/utils';
import {
    BadRequestError, ContestNotAttendedError, ContestNotEndedError,
    ContestNotFoundError, ContestNotLiveError,
    ForbiddenError, NoProblemError, NotFoundError,
    PermissionError, ProblemNotFoundError, SolutionNotFoundError, ValidationError,
} from '../error';
import {
    ProblemConfig,
    ProblemDoc, ProblemStatusDoc, Tdoc, User,
} from '../interface';
import difficultyAlgorithm from '../lib/difficulty';
import paginate from '../lib/paginate';
import { isPid, parsePid as convertPid } from '../lib/validator';
import { PERM, PRIV } from '../model/builtin';
import * as contest from '../model/contest';
import * as discussion from '../model/discussion';
import domain from '../model/domain';
import * as oplog from '../model/oplog';
import problem from '../model/problem';
import record from '../model/record';
import solution from '../model/solution';
import storage from '../model/storage';
import * as system from '../model/system';
import user from '../model/user';
import * as bus from '../service/bus';
import {
    Handler, param, post, query, Route, route, Types,
} from '../service/server';
import { registerResolver, registerValue } from './api';

export const parseCategory = (value: string) => flatten(value.replace(/，/g, ',').split(',')).map((e) => e.trim());
export const parsePid = (value: string) => (isSafeInteger(value) ? +value : value);

registerValue('FileInfo', [
    ['_id', 'String!'],
    ['name', 'String!'],
    ['size', 'Int'],
    ['lastModified', 'Date'],
]);
registerValue('Problem', [
    ['_id', 'ObjectID!'],
    ['owner', 'Int!'],
    ['domainId', 'String!'],
    ['docId', 'Int!'],
    ['docType', 'Int!'],
    ['pid', 'String'],
    ['title', 'String!'],
    ['content', 'String!'],
    ['config', 'String!'],
    ['data', '[FileInfo]'],
    ['additional_file', '[FileInfo]'],
    ['nSubmit', 'Int'],
    ['nAccept', 'Int'],
    ['difficulty', 'Int'],
    ['tag', '[String]'],
    ['hidden', 'Boolean'],
]);
registerValue('ProblemManage', [
    ['delete', 'Boolean!'],
]);

registerResolver(
    'Query', 'problem(id: Int, pid: String)', 'Problem',
    async (arg, ctx) => {
        const pdoc = await problem.get(ctx.domainId, arg.pid || arg.id);
        if (!pdoc) return null;
        if (pdoc.hidden && !ctx.user.own(pdoc)) ctx.checkPerm(PERM.PERM_VIEW_PROBLEM_HIDDEN);
        ctx.pdoc = pdoc;
        return pdoc;
    },
);
registerResolver(
    'Problem', 'manage', 'ProblemManage',
    (arg, ctx) => {
        if (!ctx.user.own(ctx.pdoc, PERM.PERM_EDIT_PROBLEM_SELF)) ctx.checkPerm(PERM.PERM_EDIT_PROBLEM);
        return {};
    },
);
registerResolver(
    'ProblemManage', 'delete', 'Boolean!',
    async (arg, ctx) => {
        const tdocs = await contest.getRelated(ctx.domainId, ctx.pdoc.docId);
        if (tdocs.length) throw new BadRequestError('Problem already used by contest {0}', tdocs[0]._id);
        return problem.del(ctx.pdoc.domainId, ctx.pdoc.docId);
    },
);
registerResolver(
    'ProblemManage', 'edit(title: String, content: String, tag: [String], hidden: Boolean)', 'Problem!',
    (arg, ctx) => problem.edit(ctx.domainId, ctx.pdoc.docId, arg),
);

export class ProblemHandler extends Handler {
    async cleanup() {
        if (this.response.template === 'problem_main.html' && this.request.json) {
            const {
                page, pcount, ppcount, pdocs, psdict, category,
            } = this.response.body;
            this.response.body = {
                title: this.renderTitle(this.translate('problem_main')),
                fragments: (await Promise.all([
                    this.renderHTML('partials/problem_list.html', {
                        page, ppcount, pcount, pdocs, psdict,
                    }),
                    this.renderHTML('partials/problem_stat.html', { pcount }),
                    this.renderHTML('partials/problem_lucky.html', { category }),
                ])).map((i) => ({ html: i })),
                raw: {
                    page, pcount, ppcount, pdocs, psdict, category,
                },
            };
        }
    }
}

export class ProblemMainHandler extends ProblemHandler {
    @param('page', Types.PositiveInt, true)
    @param('q', Types.Content, true)
    @param('category', Types.Name, true, null, parseCategory)
    async get(domainId: string, page = 1, q = '', category = []) {
        this.response.template = 'problem_main.html';
        // eslint-disable-next-line @typescript-eslint/no-shadow
        const query: FilterQuery<ProblemDoc> = {};
        let psdict = {};
        const search = global.Hydro.lib.problemSearch;
        let sort: string[];
        let fail = false;
        if (category.length) query.$and = category.map((tag) => ({ tag }));
        if (q) category.push(q);
        if (category.length) this.extraTitleContent = category.join(',');
        if (q) {
            if (search) {
                const result = await search(domainId, q);
                if (!result.length) fail = true;
                if (!query.$and) query.$and = [];
                query.$and.push({
                    $or: result.map((i) => {
                        const [did, docId] = i.split('/');
                        return { domainId: did, docId: +docId };
                    }),
                });
                sort = result;
            } else query.$text = { $search: q };
        }
        if (!this.user.hasPerm(PERM.PERM_VIEW_PROBLEM_HIDDEN)) {
            query.$or = [{ hidden: false }, { owner: this.user._id }, { maintainer: this.user._id }];
        }
        await bus.serial('problem/list', query, this);
        // eslint-disable-next-line prefer-const
        let [pdocs, ppcount, pcount] = fail
            ? [[], 0, 0]
            : await problem.list(
                domainId, query, undefined,
                page, system.get('pagination.problem'),
            );
        if (sort) pdocs = pdocs.sort((a, b) => sort.indexOf(`${a.domainId}/${a.docId}`) - sort.indexOf(`${b.domainId}/${b.docId}`));
        if (q) {
            const pdoc = await problem.get(domainId, +q || q, problem.PROJECTION_LIST);
            if (pdoc && (!pdoc.hidden || this.user.own(pdoc) || this.user.hasPerm(PERM.PERM_VIEW_PROBLEM_HIDDEN))) {
                const count = pdocs.length;
                pdocs = pdocs.filter((doc) => doc.docId !== pdoc.docId);
                pdocs.unshift(pdoc);
                pcount = pcount - count + pdocs.length;
            }
        }
        if (this.user.hasPriv(PRIV.PRIV_USER_PROFILE)) {
            psdict = await problem.getListStatus(
                domainId, this.user._id, pdocs.map((pdoc) => pdoc.docId),
            );
        }
        this.response.body = {
            page, pcount, ppcount, pdocs, psdict, category: category.join(','),
        };
    }

    @param('pid', Types.UnsignedInt)
    async postStar(domainId: string, pid: number) {
        await problem.setStar(domainId, pid, this.user._id, true);
        this.back({ star: true });
    }

    @param('pid', Types.UnsignedInt)
    async postUnstar(domainId: string, pid: number) {
        await problem.setStar(domainId, pid, this.user._id, false);
        this.back({ star: false });
    }

    @param('pids', Types.NumericArray)
    @param('target', Types.String)
    async postCopy(domainId: string, pids: number[], target: string) {
        const t = `,${this.domain.share || ''},`;
        if (t !== ',*,' && !t.includes(`,${target},`)) throw new PermissionError(target);
        const ddoc = await domain.get(target);
        if (!ddoc) throw new NotFoundError(target);
        const dudoc = await user.getById(target, this.user._id);
        if (!dudoc.hasPerm(PERM.PERM_CREATE_PROBLEM)) throw new PermissionError(PERM.PERM_CREATE_PROBLEM);
        const ids = [];
        for (const pid of pids) {
            // eslint-disable-next-line no-await-in-loop
            ids.push(await problem.copy(domainId, pid, target));
        }
        this.response.body = ids;
    }

    @param('pids', Types.NumericArray)
    async postDelete(domainId: string, pids: number[]) {
        for (const pid of pids) {
            // eslint-disable-next-line no-await-in-loop
            const pdoc = await problem.get(domainId, pid);
            if (!pdoc) continue;
            if (!this.user.own(pdoc, PERM.PERM_EDIT_PROBLEM_SELF)) this.checkPerm(PERM.PERM_EDIT_PROBLEM);
            // eslint-disable-next-line no-await-in-loop
            await problem.del(domainId, pid);
        }
        this.back();
    }

    @param('pids', Types.NumericArray)
    async postHide(domainId: string, pids: number[]) {
        for (const pid of pids) {
            // eslint-disable-next-line no-await-in-loop
            const pdoc = await problem.get(domainId, pid);
            if (!this.user.own(pdoc, PERM.PERM_EDIT_PROBLEM_SELF)) this.checkPerm(PERM.PERM_EDIT_PROBLEM);
            // eslint-disable-next-line no-await-in-loop
            await problem.edit(domainId, pid, { hidden: true });
        }
        this.back();
    }

    @param('pids', Types.NumericArray)
    async postUnhide(domainId: string, pids: number[]) {
        for (const pid of pids) {
            // eslint-disable-next-line no-await-in-loop
            const pdoc = await problem.get(domainId, pid);
            if (!this.user.own(pdoc, PERM.PERM_EDIT_PROBLEM_SELF)) this.checkPerm(PERM.PERM_EDIT_PROBLEM);
            // eslint-disable-next-line no-await-in-loop
            await problem.edit(domainId, pid, { hidden: false });
        }
        this.back();
    }
}

export class ProblemRandomHandler extends ProblemHandler {
    @param('category', Types.Name, true, null, parseCategory)
    async get(domainId: string, category: string[] = []) {
        const q: FilterQuery<ProblemDoc> = category.length ? { $and: [] } : {};
        for (const tag of category) q.$and.push({ tag });
        if (!this.user.hasPerm(PERM.PERM_VIEW_PROBLEM_HIDDEN)) q.hidden = false;
        await bus.serial('problem/list', q, this);
        const pid = await problem.random(domainId, q);
        if (!pid) throw new NoProblemError();
        this.response.body = { pid };
        this.response.redirect = this.url('problem_detail', { pid });
    }
}

export class ProblemDetailHandler extends ProblemHandler {
    pdoc: ProblemDoc;
    tdoc?: Tdoc<30>;
    tsdoc?: any;
    udoc: User;
    psdoc: ProblemStatusDoc;

    @route('pid', Types.Name, true, null, parsePid)
    @query('tid', Types.ObjectID, true)
    async _prepare(domainId: string, pid: number | string, tid?: ObjectID) {
        this.pdoc = await problem.get(domainId, pid);
        if (!this.pdoc) throw new ProblemNotFoundError(domainId, pid);
        if (tid) {
            this.tdoc = await contest.get(domainId, tid);
            if (!this.tdoc) throw new ContestNotFoundError(domainId, tid);
            this.tsdoc = await contest.getStatus(domainId, tid, this.user._id);
            this.pdoc.tag.length = 0;
            const showAccept = contest.canShowScoreboard.call(this, this.tdoc, true);
            if (!showAccept) this.pdoc.nAccept = 0;
            if (contest.isNotStarted(this.tdoc)) throw new ContestNotLiveError(tid);
            if (!contest.isDone(this.tdoc) && !this.tsdoc?.attend) throw new ContestNotAttendedError(tid);
        } else if (this.pdoc.hidden && !this.user.own(this.pdoc)) {
            this.checkPerm(PERM.PERM_VIEW_PROBLEM_HIDDEN);
        }
        let ddoc = this.domain;
        if (this.pdoc.reference) {
            ddoc = await domain.get(this.pdoc.reference.domainId);
            const pdoc = await problem.get(this.pdoc.reference.domainId, this.pdoc.reference.pid);
            if (!ddoc || !pdoc) throw new ProblemNotFoundError(this.pdoc.reference.domainId, this.pdoc.reference.pid);
            this.pdoc.config = pdoc.config;
        }
        if (ddoc.langs) {
            (this.pdoc.config as ProblemConfig).langs = intersection(
                (this.pdoc.config as ProblemConfig).langs || ddoc.langs.split(','),
                ddoc.langs.split(','),
            );
        }
        await bus.serial('problem/get', this.pdoc, this);
        [this.psdoc, this.udoc] = await Promise.all([
            problem.getStatus(domainId, this.pdoc.docId, this.user._id),
            user.getById(domainId, this.pdoc.owner),
        ]);
        const [scnt, dcnt] = await Promise.all([
            solution.count(domainId, { parentId: this.pdoc.docId }),
            discussion.count(domainId, { parentId: this.pdoc.docId }),
        ]);
        this.response.body = {
            pdoc: this.pdoc,
            udoc: this.udoc,
            psdoc: this.psdoc,
            title: this.pdoc.title,
            solutionCount: scnt,
            discussionCount: dcnt,
            tdoc: this.tdoc,
            tsdoc: this.tsdoc,
        };
        this.response.template = 'problem_detail.html';
        this.extraTitleContent = this.pdoc.title;
    }

    @query('tid', Types.ObjectID, true)
    async get(...args: any[]) {
        // Navigate to current additional file download
        // e.g. ![img](a.jpg) will navigate to ![img](./pid/file/a.jpg)
        if (!this.request.json) {
            if (args[1]) {
                this.response.body.pdoc.content = this.response.body.pdoc.content
                    .replace(/\(file:\/\/(.+?)\)/g, (str) => {
                        const info = str.match(/\(file:\/\/(.+?)\)/);
                        return `(./${this.pdoc.docId}/file/${info[1]}${info[1].includes('?') ? '&' : '?'}tid=${args[1]})`;
                    })
                    .replace(/="file:\/\/(.+?)"/g, (str) => {
                        const info = str.match(/="file:\/\/(.+?)"/);
                        return `="./${this.pdoc.docId}/file/${info[1]}${info[1].includes('?') ? '&' : '?'}tid=${args[1]}"`;
                    });
            } else {
                this.response.body.pdoc.content = this.response.body.pdoc.content
                    .replace(/\(file:\/\//g, `(./${this.pdoc.docId}/file/`)
                    .replace(/="file:\/\//g, `="./${this.pdoc.docId}/file/`);
            }
        }
        this.response.body.page_name = this.tdoc
            ? this.tdoc.rule === 'homework'
                ? 'homework_detail_problem'
                : 'contest_detail_problem'
            : 'problem_detail';
        if (!this.response.body.tdoc) {
            if (this.psdoc?.rid) {
                this.response.body.rdoc = await record.get(this.domainId, this.psdoc.rid);
            }
            this.response.body.ctdocs = await contest.getRelated(this.domainId, this.pdoc.docId);
        }
    }

    @param('pid', Types.UnsignedInt)
    async postRejudge(domainId: string, pid: number) {
        this.checkPerm(PERM.PERM_REJUDGE_PROBLEM);
        // TODO maybe async?
        await record.getMulti(domainId, { pid }).forEach(async (doc) => {
            await record.reset(domainId, doc._id, true);
            await record.judge(domainId, doc._id, -50);
        });
        this.back();
    }

    @param('target', Types.String)
    async postCopy(domainId: string, target: string) {
        const t = `,${this.domain.share || ''},`;
        if (t !== ',*,' && !t.includes(`,${target},`)) throw new PermissionError(target);
        const ddoc = await domain.get(target);
        if (!ddoc) throw new NotFoundError(target);
        const dudoc = await user.getById(target, this.user._id);
        if (!dudoc.hasPerm(PERM.PERM_CREATE_PROBLEM)) throw new PermissionError(PERM.PERM_CREATE_PROBLEM);
        const docId = await problem.copy(domainId, this.pdoc.docId, target);
        this.response.redirect = this.url('problem_detail', { domainId: target, pid: docId });
    }

    async postDelete() {
        if (!this.user.own(this.pdoc, PERM.PERM_EDIT_PROBLEM_SELF)) this.checkPerm(PERM.PERM_EDIT_PROBLEM);
        const tdocs = await contest.getRelated(this.domainId, this.pdoc.docId);
        if (tdocs.length) throw new BadRequestError('Problem already used by contest {0}', tdocs[0]._id);
        await problem.del(this.pdoc.domainId, this.pdoc.docId);
        this.response.redirect = this.url('problem_main');
    }
}

export class ProblemSubmitHandler extends ProblemDetailHandler {
    @param('tid', Types.ObjectID, true)
    async prepare(domainId: string, tid?: ObjectID) {
        if (tid && !contest.isOngoing(this.tdoc)) throw new ContestNotLiveError(this.tdoc.docId);
    }

    async get() {
        this.response.template = 'problem_submit.html';
        this.response.body = {
            pdoc: this.pdoc,
            udoc: this.udoc,
            title: this.pdoc.title,
            page_name: this.tdoc
                ? this.tdoc.rule === 'homework'
                    ? 'homework_detail_problem_submit'
                    : 'contest_detail_problem_submit'
                : 'problem_submit',
        };
    }

    @param('lang', Types.Name)
    @param('code', Types.Content)
    @param('pretest', Types.Boolean)
    @param('input', Types.String, true)
    @param('tid', Types.ObjectID, true)
    async post(domainId: string, lang: string, code: string, pretest = false, input = '', tid?: ObjectID) {
        if (this.response.body.pdoc.config?.langs && !this.response.body.pdoc.config.langs.includes(lang)) {
            throw new BadRequestError('Language not allowed.');
        }
        if (pretest && !['default', 'fileio'].includes(this.response.body.pdoc.config?.type)) throw new BadRequestError('unable to run pretest');
        await this.limitRate('add_record', 60, system.get('limit.submission'));
        const rid = await record.add(domainId, this.pdoc.docId, this.user._id, lang, code, true, pretest ? input : tid, tid && !pretest);
        const rdoc = await record.get(domainId, rid);
        if (!pretest) {
            await Promise.all([
                (this.tdoc
                    ? (this.tsdoc.journal || []).filter((i) => i.pid === this.pdoc.docId).length
                    : this.psdoc?.rid ? Promise.resolve() : problem.inc(domainId, this.pdoc.docId, 'nSubmit', 1)
                ) && problem.inc(this.domainId, this.pdoc.docId, 'nSubmit', 1),
                problem.incStatus(domainId, this.pdoc.docId, this.user._id, 'nSubmit', 1),
                domain.incUserInDomain(domainId, this.user._id, 'nSubmit'),
                tid && contest.updateStatus(domainId, tid, this.user._id, rid, this.pdoc.docId),
            ]);
        }
        bus.broadcast('record/change', rdoc);
        if (tid && !pretest && !contest.canShowSelfRecord.call(this, this.tdoc)) {
            this.response.body = { tid };
            this.response.redirect = this.url(this.tdoc.rule === 'homework' ? 'homework_detail' : 'contest_detail', { tid });
        } else {
            this.response.body = { rid };
            this.response.redirect = this.url('record_detail', { rid });
        }
    }
}

export class ProblemManageHandler extends ProblemDetailHandler {
    async prepare() {
        if (!this.user.own(this.pdoc, PERM.PERM_EDIT_PROBLEM_SELF)) this.checkPerm(PERM.PERM_EDIT_PROBLEM);
    }
}

export class ProblemEditHandler extends ProblemManageHandler {
    async get() {
        this.response.template = 'problem_edit.html';
    }

    @route('pid', Types.Name, null, parsePid)
    @post('title', Types.Title)
    @post('content', Types.Content)
    @post('pid', Types.Name, isPid, convertPid, true)
    @post('hidden', Types.Boolean)
    @post('tag', Types.Content, true, null, parseCategory)
    async post(
        domainId: string, pid: string | number, title: string, content: string,
        newPid: string = '', hidden = false, tag: string[] = [],
    ) {
        if (newPid !== this.pdoc.pid && await problem.get(domainId, newPid)) throw new BadRequestError('new pid exists');
        const $update: Partial<ProblemDoc> = {
            title, content, pid: newPid, hidden, tag: tag ?? [],
        };
        let pdoc = await problem.get(domainId, pid);
        $update.difficulty = difficultyAlgorithm(pdoc.nSubmit, pdoc.nAccept);
        pdoc = await problem.edit(domainId, pdoc.docId, $update);
        this.response.redirect = this.url('problem_detail', { pid: newPid || pdoc.docId });
    }
}

export class ProblemFilesHandler extends ProblemDetailHandler {
    notUsage = true;

    @param('testdata', Types.Boolean)
    @param('additional_file', Types.Boolean)
    @param('pjax', Types.Boolean)
    async get(domainId: string, getTestdata = true, getAdditionalFile = true, pjax = false) {
        this.response.body.testdata = getTestdata ? sortFiles(this.pdoc.data || []) : [];
        this.response.body.reference = getTestdata ? this.pdoc.reference : '';
        this.response.body.additional_file = getAdditionalFile ? sortFiles(this.pdoc.additional_file || []) : [];
        if (pjax) {
            const { testdata, additional_file } = this.response.body;
            const owner_udoc = await user.getById(domainId, this.pdoc.owner);
            this.response.body = {
                fragments: (await Promise.all([
                    this.renderHTML('partials/problem_files-testdata.html', { testdata, pdoc: this.pdoc }),
                    this.renderHTML('partials/problem_files-additional_file.html', { additional_file, pdoc: this.pdoc }),
                    this.renderHTML('partials/problem-sidebar-information.html', { pdoc: this.pdoc, owner_udoc }),
                ])).map((i) => ({ html: i })),
            };
            this.response.template = '';
        } else this.response.template = 'problem_files.html';
    }

    @post('files', Types.Set)
    @post('type', Types.Range(['testdata', 'additional_file']), true)
    async postGetLinks(domainId: string, files: Set<string>, type = 'testdata') {
        if (type === 'testdata' && !this.user.own(this.pdoc)) {
            if (!this.user.hasPriv(PRIV.PRIV_READ_PROBLEM_DATA)) this.checkPerm(PERM.PERM_READ_PROBLEM_DATA);
            if (this.tdoc && !contest.isDone(this.tdoc)) throw new ContestNotEndedError(this.tdoc.domainId, this.tdoc.docId);
        }
        if (this.pdoc.reference) this.pdoc = await problem.get(this.pdoc.reference.domainId, this.pdoc.reference.pid);
        const links = {};
        const size = Math.sum(
            this.pdoc[type === 'testdata' ? 'data' : 'additional_file']
                ?.filter((i) => files.has(i.name))
                ?.map((i) => i.size),
        ) || 0;
        await oplog.add({
            type: 'bulkDownload',
            time: new Date(),
            uid: this.user._id,
            ip: this.request.ip,
            fileType: 'problem',
            target: Array.from(files).map((file) => `problem/${this.pdoc.domainId}/${this.pdoc.docId}/${type}/${file}`),
            referer: this.request.referer,
            size,
        });
        for (const file of files) {
            // eslint-disable-next-line no-await-in-loop
            links[file] = await storage.signDownloadLink(
                `problem/${this.pdoc.domainId}/${this.pdoc.docId}/${type}/${file}`,
                file, false, 'user',
            );
        }
        this.response.body.links = links;
    }

    @post('filename', Types.Name, true)
    @post('type', Types.Range(['testdata', 'additional_file']), true)
    async postUploadFile(domainId: string, filename: string, type = 'testdata') {
        if (this.pdoc.reference) throw new ForbiddenError('Cannot delete files of a referenced problem.');
        if (!this.request.files.file) throw new ValidationError('file');
        if (!filename) filename = this.request.files.file.name || String.random(16);
        if (filename.includes('/') || filename.includes('..')) throw new ValidationError('filename', null, 'Bad filename');
        if (!this.user.own(this.pdoc, PERM.PERM_EDIT_PROBLEM_SELF)) this.checkPerm(PERM.PERM_EDIT_PROBLEM);
        const files = [];
        if (filename.endsWith('.zip')) {
            const zip = new AdmZip(this.request.files.file.path);
            const entries = zip.getEntries();
            for (const entry of entries) {
                if (!entry.name) continue;
                files.push({
                    type,
                    name: entry.name,
                    size: entry.header.size,
                    data: () => entry.getData(),
                });
            }
        } else {
            files.push({
                type,
                name: filename,
                size: statSync(this.request.files.file.path).size,
                data: () => this.request.files.file.path,
            });
        }
        if (!this.user.hasPriv(PRIV.PRIV_EDIT_SYSTEM)) {
            if ((this.pdoc.data?.length || 0)
                + (this.pdoc.additional_file?.length || 0)
                + files.length
                >= system.get('limit.problem_files_max')) {
                throw new ForbiddenError('File limit exceeded.');
            }
            const size = Math.sum(
                (this.pdoc.data || []).map((i) => i.size),
                (this.pdoc.additional_file || []).map((i) => i.size),
                files.map((i) => i.size),
            );
            if (size >= system.get('limit.problem_files_max_size')) {
                throw new ForbiddenError('File size limit exceeded.');
            }
        }
        for (const entry of files) {
            if (entry.type === 'testdata') {
                // eslint-disable-next-line no-await-in-loop
                await problem.addTestdata(domainId, this.pdoc.docId, entry.name, entry.data());
            } else {
                // eslint-disable-next-line no-await-in-loop
                await problem.addAdditionalFile(domainId, this.pdoc.docId, entry.name, entry.data());
            }
        }
        this.back();
    }

    @post('files', Types.Array)
    @post('type', Types.Range(['testdata', 'additional_file']), true)
    async postDeleteFiles(domainId: string, files: string[], type = 'testdata') {
        if (this.pdoc.reference) throw new ForbiddenError('Cannot delete files of a referenced problem.');
        if (!this.user.own(this.pdoc, PERM.PERM_EDIT_PROBLEM_SELF)) this.checkPerm(PERM.PERM_EDIT_PROBLEM);
        if (type === 'testdata') await problem.delTestdata(domainId, this.pdoc.docId, files);
        else await problem.delAdditionalFile(domainId, this.pdoc.docId, files);
        this.back();
    }
}

export class ProblemFileDownloadHandler extends ProblemDetailHandler {
    @query('type', Types.Range(['additional_file', 'testdata']), true)
    @param('filename', Types.Name)
    @param('noDisposition', Types.Boolean)
    async get(domainId: string, type = 'additional_file', filename: string, noDisposition = false) {
        if (this.pdoc.reference) {
            if (type === 'testdata') throw new ForbiddenError('Cannot download testdata');
            this.pdoc = await problem.get(this.pdoc.reference.domainId, this.pdoc.reference.pid);
            if (!this.pdoc) throw new ProblemNotFoundError();
        }
        if (type === 'testdata' && !this.user.own(this.pdoc)) {
            if (!this.user.hasPriv(PRIV.PRIV_READ_PROBLEM_DATA)) this.checkPerm(PERM.PERM_READ_PROBLEM_DATA);
            if (this.tdoc && !contest.isDone(this.tdoc)) throw new ContestNotEndedError(this.tdoc.domainId, this.tdoc.docId);
        }
        const target = `problem/${this.pdoc.domainId}/${this.pdoc.docId}/${type}/${filename}`;
        const file = await storage.getMeta(target);
        await oplog.add({
            type: 'download',
            time: new Date(),
            uid: this.user._id,
            ip: this.request.ip,
            fileType: 'problem',
            target,
            referer: this.request.referer,
            size: file?.size || 0,
        });
        if (!file) {
            this.response.redirect = await storage.signDownloadLink(
                target, noDisposition ? undefined : filename, false, 'user',
            );
            return;
        }
        const fileType = lookup(filename).toString();
        const shouldProxy = ['image', 'video', 'audio', 'pdf', 'vnd'].filter((i) => fileType.includes(i)).length;
        if (shouldProxy && file.size! < 32 * 1024 * 1024) {
            this.response.etag = file.etag;
            this.response.body = await storage.get(target);
            this.response.type = file['Content-Type'] || fileType;
            this.response.disposition = `attachment; filename=${encodeURIComponent(filename)}`;
        } else {
            this.response.redirect = await storage.signDownloadLink(
                target, noDisposition ? undefined : filename, false, 'user',
            );
        }
    }
}

export class ProblemSolutionHandler extends ProblemDetailHandler {
    @param('page', Types.PositiveInt, true)
    @param('tid', Types.ObjectID, true)
    async get(domainId: string, page = 1, tid?: ObjectID) {
        if (tid) throw new PermissionError(PERM.PERM_VIEW_PROBLEM_SOLUTION);
        this.response.template = 'problem_solution.html';
        this.checkPerm(PERM.PERM_VIEW_PROBLEM_SOLUTION);
        const [psdocs, pcount, pscount] = await paginate(
            solution.getMulti(domainId, this.pdoc.docId),
            page,
            system.get('pagination.solution'),
        );
        const uids = [this.pdoc.owner];
        const docids = [];
        for (const psdoc of psdocs) {
            docids.push(psdoc.docId);
            uids.push(psdoc.owner);
            if (psdoc.reply.length) {
                for (const psrdoc of psdoc.reply) uids.push(psrdoc.owner);
            }
        }
        const udict = await user.getList(domainId, uids);
        const pssdict = await solution.getListStatus(domainId, docids, this.user._id);
        this.response.body = {
            psdocs, page, pcount, pscount, udict, pssdict, pdoc: this.pdoc,
        };
        await bus.serial('handler/solution/get', this);
    }

    @param('content', Types.Content)
    async postSubmit(domainId: string, content: string) {
        this.checkPerm(PERM.PERM_CREATE_PROBLEM_SOLUTION);
        await solution.add(domainId, this.pdoc.docId, this.user._id, content);
        this.back();
    }

    @param('content', Types.Content)
    @param('psid', Types.ObjectID)
    async postEditSolution(domainId: string, content: string, psid: ObjectID) {
        let psdoc = await solution.get(domainId, psid);
        if (!this.user.own(psdoc)) this.checkPerm(PERM.PERM_EDIT_PROBLEM_SOLUTION);
        else this.checkPerm(PERM.PERM_EDIT_PROBLEM_SOLUTION_SELF);
        psdoc = await solution.edit(domainId, psdoc.docId, content);
        this.back({ psdoc });
    }

    @param('psid', Types.ObjectID)
    async postDeleteSolution(domainId: string, psid: ObjectID) {
        const psdoc = await solution.get(domainId, psid);
        if (!this.user.own(psdoc)) this.checkPerm(PERM.PERM_DELETE_PROBLEM_SOLUTION);
        else this.checkPerm(PERM.PERM_DELETE_PROBLEM_SOLUTION_SELF);
        await solution.del(domainId, psdoc.docId);
        this.back();
    }

    @param('psid', Types.ObjectID)
    @param('content', Types.Content)
    async postReply(domainId: string, psid: ObjectID, content: string) {
        this.checkPerm(PERM.PERM_REPLY_PROBLEM_SOLUTION);
        const psdoc = await solution.get(domainId, psid);
        await solution.reply(domainId, psdoc.docId, this.user._id, content);
        this.back();
    }

    @param('psid', Types.ObjectID)
    @param('psrid', Types.ObjectID)
    @param('content', Types.Content)
    async postEditReply(domainId: string, psid: ObjectID, psrid: ObjectID, content: string) {
        const [psdoc, psrdoc] = await solution.getReply(domainId, psid, psrid);
        if ((!psdoc) || psdoc.parentId !== this.pdoc.docId) throw new SolutionNotFoundError(domainId, psid);
        if (!(!this.user.own(psrdoc)
            && this.user.hasPerm(PERM.PERM_EDIT_PROBLEM_SOLUTION_REPLY_SELF))) {
            throw new PermissionError(PERM.PERM_EDIT_PROBLEM_SOLUTION_REPLY_SELF);
        }
        await solution.editReply(domainId, psid, psrid, content);
        this.back();
    }

    @param('psid', Types.ObjectID)
    @param('psrid', Types.ObjectID)
    async postDeleteReply(domainId: string, psid: ObjectID, psrid: ObjectID) {
        const [psdoc, psrdoc] = await solution.getReply(domainId, psid, psrid);
        if ((!psdoc) || psdoc.parentId !== this.pdoc.docId) throw new SolutionNotFoundError(psid);
        if (!(!this.user.own(psrdoc)
            && this.user.hasPerm(PERM.PERM_DELETE_PROBLEM_SOLUTION_REPLY_SELF))) {
            this.checkPerm(PERM.PERM_DELETE_PROBLEM_SOLUTION_REPLY);
        }
        await solution.delReply(domainId, psid, psrid);
        this.back();
    }

    @param('psid', Types.ObjectID)
    async postUpvote(domainId: string, psid: ObjectID) {
        const [psdoc, pssdoc] = await solution.vote(domainId, psid, this.user._id, 1);
        this.back({ vote: psdoc.vote, user_vote: pssdoc.vote });
    }

    @param('psid', Types.ObjectID)
    async postDownvote(domainId: string, psid: ObjectID) {
        const [psdoc, pssdoc] = await solution.vote(domainId, psid, this.user._id, -1);
        this.back({ vote: psdoc.vote, user_vote: pssdoc.vote });
    }
}

export class ProblemSolutionRawHandler extends ProblemDetailHandler {
    @param('psid', Types.ObjectID)
    @route('psrid', Types.ObjectID, true)
    @param('tid', Types.ObjectID, true)
    async get(domainId: string, psid: ObjectID, psrid?: ObjectID, tid?: ObjectID) {
        if (tid) throw new PermissionError(PERM.PERM_VIEW_PROBLEM_SOLUTION);
        this.checkPerm(PERM.PERM_VIEW_PROBLEM_SOLUTION);
        if (psrid) {
            const [psdoc, psrdoc] = await solution.getReply(domainId, psid, psrid);
            if ((!psdoc) || psdoc.parentId !== this.pdoc.docId) throw new SolutionNotFoundError(psid, psrid);
            this.response.body = psrdoc.content;
        } else {
            const psdoc = await solution.get(domainId, psid);
            this.response.body = psdoc.content;
        }
        this.response.type = 'text/markdown';
    }
}

export class ProblemCreateHandler extends Handler {
    async get() {
        this.response.template = 'problem_edit.html';
        this.response.body = {
            page_name: 'problem_create',
        };
    }

    @post('title', Types.Title)
    @post('content', Types.Content)
    @post('pid', Types.Name, true, isPid, convertPid)
    @post('hidden', Types.Boolean)
    @post('tag', Types.Content, true, null, parseCategory)
    async post(domainId: string, title: string, content: string, pid: string, hidden = false, tag: string[] = []) {
        if (pid && await problem.get(domainId, pid)) throw new BadRequestError('invalid pid');
        const docId = await problem.add(domainId, pid, title, content, this.user._id, tag ?? [], hidden);
        this.response.body = { pid: pid || docId };
        this.response.redirect = this.url('problem_files', { pid: pid || docId });
    }
}

export class ProblemPrefixListHandler extends Handler {
    @param('prefix', Types.Name)
    async get(domainId: string, prefix: string) {
        const pdocs = await problem.getPrefixList(domainId, prefix);
        if (!Number.isNaN(+prefix)) {
            const pdoc = await problem.get(domainId, +prefix, ['domainId', 'docId', 'pid', 'title']);
            if (pdoc) pdocs.unshift(pdoc);
        }
        const search = global.Hydro.lib.problemSearch;
        if (pdocs.length < 20) {
            if (search) {
                const result = await search(domainId, prefix, 20 - pdocs.length);
                const docs = await problem.getMulti(domainId, { docId: { $in: result } }).toArray();
                pdocs.push(...docs);
            }
        }
        this.response.body = pdocs;
    }
}

export async function apply() {
    Route('problem_main', '/p', ProblemMainHandler, PERM.PERM_VIEW_PROBLEM);
    Route('problem_category', '/p/category/:category', ProblemMainHandler, PERM.PERM_VIEW_PROBLEM);
    Route('problem_random', '/problem/random', ProblemRandomHandler, PERM.PERM_VIEW_PROBLEM);
    Route('problem_detail', '/p/:pid', ProblemDetailHandler, PERM.PERM_VIEW_PROBLEM);
    Route('problem_submit', '/p/:pid/submit', ProblemSubmitHandler, PERM.PERM_SUBMIT_PROBLEM);
    Route('problem_edit', '/p/:pid/edit', ProblemEditHandler);
    Route('problem_files', '/p/:pid/files', ProblemFilesHandler, PERM.PERM_VIEW_PROBLEM);
    Route('problem_file_download', '/p/:pid/file/:filename', ProblemFileDownloadHandler, PERM.PERM_VIEW_PROBLEM);
    Route('problem_solution', '/p/:pid/solution', ProblemSolutionHandler, PERM.PERM_VIEW_PROBLEM);
    Route('problem_solution_raw', '/p/:pid/solution/:psid/raw', ProblemSolutionRawHandler, PERM.PERM_VIEW_PROBLEM);
    Route('problem_solution_reply_raw', '/p/:pid/solution/:psid/:psrid/raw', ProblemSolutionRawHandler, PERM.PERM_VIEW_PROBLEM);
    Route('problem_create', '/problem/create', ProblemCreateHandler, PERM.PERM_CREATE_PROBLEM);
    Route('problem_prefix_list', '/problem/list', ProblemPrefixListHandler, PERM.PERM_VIEW_PROBLEM);
}

global.Hydro.handler.problem = apply;
