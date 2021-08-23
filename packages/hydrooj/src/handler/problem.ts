import { isSafeInteger, flatten } from 'lodash';
import { FilterQuery, ObjectID } from 'mongodb';
import AdmZip from 'adm-zip';
import { sortFiles } from '@hydrooj/utils/lib/utils';
import { lookup } from 'mime-types';
import { registerResolver, registerValue } from './api';
import {
    NoProblemError, PermissionError, ValidationError,
    SolutionNotFoundError, ProblemNotFoundError, BadRequestError,
    ForbiddenError,
} from '../error';
import {
    ProblemDoc, User, ProblemStatusDoc,
} from '../interface';
import paginate from '../lib/paginate';
import { isPid, parsePid as convertPid } from '../lib/validator';
import difficultyAlgorithm from '../lib/difficulty';
import * as system from '../model/system';
import problem from '../model/problem';
import record from '../model/record';
import domain from '../model/domain';
import user from '../model/user';
import * as document from '../model/document';
import * as contest from '../model/contest';
import solution from '../model/solution';
import { PERM, PRIV } from '../model/builtin';
import storage from '../model/storage';
import * as bus from '../service/bus';
import {
    Route, Handler, Types, param, post, route, query,
} from '../service/server';

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
registerResolver('Query', 'problem(id: Int, pid: String)', 'Problem', async (arg, ctx) => {
    const pdoc = await problem.get(ctx.domainId, arg.pid || arg.id);
    if (!pdoc) return null;
    if (pdoc.hidden && !ctx.user.own(pdoc)) ctx.checkPerm(PERM.PERM_VIEW_PROBLEM_HIDDEN);
    return pdoc;
});

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
        let sort: number[];
        if (category.length) {
            query.$and = [];
            for (const tag of category) query.$and.push({ tag });
        }
        if (q) category.push(q);
        if (category.length) this.extraTitleContent = category.join(',');
        if (q) {
            if (search) {
                const result = await search(domainId, q);
                query.docId = { $in: result };
                sort = result;
            } else query.$text = { $search: q };
        }
        if (!this.user.hasPerm(PERM.PERM_VIEW_PROBLEM_HIDDEN)) {
            query.$or = [{ hidden: false }, { owner: this.user._id }, { maintainer: this.user._id }];
        }
        await bus.serial('problem/list', query, this);
        // eslint-disable-next-line prefer-const
        let [pdocs, ppcount, pcount] = await paginate(
            problem.getMulti(domainId, query).sort({ pid: 1, docId: 1 }),
            page,
            system.get('pagination.problem'),
        );
        if (sort) pdocs = pdocs.sort((a, b) => sort.indexOf(a.docId) - sort.indexOf(b.docId));
        if (q) {
            const pdoc = await problem.get(domainId, +q || q, problem.PROJECTION_LIST);
            if (pdoc) {
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
    udoc: User;
    psdoc: ProblemStatusDoc;

    @route('pid', Types.Name, true, null, parsePid)
    async _prepare(domainId: string, pid: number | string) {
        this.response.template = 'problem_detail.html';
        this.pdoc = await problem.get(domainId, pid);
        if (!this.pdoc) throw new ProblemNotFoundError(domainId, pid);
        if (this.pdoc.hidden && !this.user.own(this.pdoc)) {
            this.checkPerm(PERM.PERM_VIEW_PROBLEM_HIDDEN);
        }
        await bus.serial('problem/get', this.pdoc, this);
        [this.psdoc, this.udoc] = await Promise.all([
            problem.getStatus(domainId, this.pdoc.docId, this.user._id),
            user.getById(domainId, this.pdoc.owner),
        ]);
        this.response.body = {
            pdoc: this.pdoc,
            udoc: this.udoc,
            title: this.pdoc.title,
        };
        this.extraTitleContent = this.pdoc.title;
    }

    // eslint-disable-next-line @typescript-eslint/no-unused-vars
    async get(..._args: any[]) {
        // Navigate to current additional file download
        // e.g. ![img](a.jpg) will navigate to ![img](./pid/file/a.jpg)
        if (!this.request.json) {
            this.response.body.pdoc.content = this.response.body.pdoc.content
                .replace(/\(file:\/\//g, `(./${this.pdoc.docId}/file/`)
                .replace(/="file:\/\//g, `="./${this.pdoc.docId}/file/`);
        }
        if (this.psdoc) {
            this.response.body.rdoc = await record.get(this.domainId, this.psdoc.rid);
        }
        this.response.body.ctdocs = await contest.getRelated(this.domainId, this.pdoc.docId);
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

    async postDelete() {
        if (!this.user.own(this.pdoc, PERM.PERM_EDIT_PROBLEM_SELF)) this.checkPerm(PERM.PERM_EDIT_PROBLEM);
        const [ctdocs, htdocs] = await Promise.all([
            contest.getRelated(this.domainId, this.pdoc.docId, document.TYPE_CONTEST),
            contest.getRelated(this.domainId, this.pdoc.docId, document.TYPE_HOMEWORK),
        ]);
        if (ctdocs.length) throw new BadRequestError('Problem already used by contest {0}', ctdocs[0]._id);
        if (htdocs.length) throw new BadRequestError('Problem already used by homwrork {0}', htdocs[0]._id);
        await problem.del(this.pdoc.domainId, this.pdoc.docId);
        this.response.redirect = this.url('problem_main');
    }
}

export class ProblemSubmitHandler extends ProblemDetailHandler {
    async get() {
        this.response.template = 'problem_submit.html';
        this.response.body = {
            pdoc: this.pdoc,
            udoc: this.udoc,
            title: this.pdoc.title,
        };
    }

    @param('lang', Types.Name)
    @param('code', Types.Content)
    @param('pretest', Types.Boolean)
    @param('input', Types.String, true)
    async post(domainId: string, lang: string, code: string, pretest = false, input = '') {
        if (this.response.body.pdoc.config?.langs && !this.response.body.pdoc.config.langs.includes(lang)) {
            throw new BadRequestError('Language not allowed.');
        }
        if (this.domain.langs && !this.domain.langs.includes(lang)) {
            throw new BadRequestError('Language not allowed');
        }
        await this.limitRate('add_record', 60, system.get('limit.submission'));
        const rid = await record.add(domainId, this.pdoc.docId, this.user._id, lang, code, true, pretest ? input : undefined);
        const rdoc = await record.get(domainId, rid);
        if (!pretest) {
            await Promise.all([
                this.psdoc?.rid ? Promise.resolve() : problem.inc(domainId, this.pdoc.docId, 'nSubmit', 1),
                problem.incStatus(domainId, this.pdoc.docId, this.user._id, 'nSubmit', 1),
                domain.incUserInDomain(domainId, this.user._id, 'nSubmit'),
            ]);
        }
        bus.broadcast('record/change', rdoc);
        this.response.body = { rid };
        this.response.redirect = this.url('record_detail', { rid });
    }
}

export class ProblemPretestHandler extends ProblemDetailHandler {
    @param('lang', Types.Name)
    @param('code', Types.Content)
    @param('input', Types.Content, true)
    async post(domainId: string, lang: string, code: string, input = '') {
        await this.limitRate('do_pretest', 60, system.get('limit.pretest'));
        const rid = await record.add(
            domainId, this.pdoc.docId, this.user._id,
            lang, code, true, input,
        );
        const rdoc = await record.get(domainId, rid);
        bus.broadcast('record/change', rdoc);
        this.response.body = { rid };
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
        }
        const links = {};
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
        if ((this.pdoc.data?.length || 0) + (this.pdoc.additional_file?.length || 0) >= system.get('limit.problem_files_max')) {
            throw new ForbiddenError('File limit exceeded.');
        }
        if (!this.request.files.file) throw new ValidationError('file');
        const size = Math.sum((this.pdoc.data || []).map((i) => i.size), (this.pdoc.additional_file || []).map((i) => i.size));
        if (size >= system.get('limit.problem_files_max_size')) {
            throw new ForbiddenError('File size limit exceeded.');
        }
        if (!filename) filename = this.request.files.file.name || String.random(16);
        if (filename.includes('/') || filename.includes('..')) throw new ValidationError('filename', null, 'Bad filename');
        if (!this.user.own(this.pdoc, PERM.PERM_EDIT_PROBLEM_SELF)) this.checkPerm(PERM.PERM_EDIT_PROBLEM);
        if (filename.endsWith('.zip')) {
            const zip = new AdmZip(this.request.files.file.path);
            const entries = zip.getEntries();
            for (const entry of entries) {
                if (!entry.name) continue;
                if (type === 'testdata') {
                    // eslint-disable-next-line no-await-in-loop
                    await problem.addTestdata(domainId, this.pdoc.docId, entry.name, entry.getData());
                } else {
                    // eslint-disable-next-line no-await-in-loop
                    await problem.addAdditionalFile(domainId, this.pdoc.docId, entry.name, entry.getData());
                }
            }
        } else if (type === 'testdata') {
            await problem.addTestdata(domainId, this.pdoc.docId, filename, this.request.files.file.path);
        } else {
            await problem.addAdditionalFile(domainId, this.pdoc.docId, filename, this.request.files.file.path);
        }
        this.back();
    }

    @post('files', Types.Array)
    @post('type', Types.Range(['testdata', 'additional_file']), true)
    async postDeleteFiles(domainId: string, files: string[], type = 'testdata') {
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
        if (type === 'testdata' && !this.user.own(this.pdoc)) {
            if (!this.user.hasPriv(PRIV.PRIV_READ_PROBLEM_DATA)) this.checkPerm(PERM.PERM_READ_PROBLEM_DATA);
        }
        const target = `problem/${domainId}/${this.pdoc.docId}/${type}/${filename}`;
        const file = await storage.getMeta(target);
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
    async get(domainId: string, page = 1) {
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
    async get(domainId: string, psid: ObjectID, psrid?: ObjectID) {
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
        let cors = false;
        if (prefix.includes(':')) {
            const [pdomain, s] = prefix.split(':');
            const ddoc = await domain.get(pdomain);
            this.response.body = [];
            if (!ddoc || ddoc._id === domainId || !ddoc.share || !s.trim()) return;
            ddoc.share = ddoc.share.replace(/，/g, ',').split(',').map((q) => q.trim()).join(',');
            if (ddoc.share !== '*' && !`,${ddoc.share},`.includes(`,${domainId},`)) return;
            domainId = pdomain;
            prefix = s;
            cors = true;
        }
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
        if (cors) this.response.body.forEach((v) => { v.docId = `${domainId}:${v.docId}`; });
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
