import { isSafeInteger, flatten } from 'lodash';
import yaml from 'js-yaml';
import fs from 'fs-extra';
import { FilterQuery, ObjectID } from 'mongodb';
import superagent from 'superagent';
import AdmZip from 'adm-zip';
import {
    NoProblemError, BadRequestError, PermissionError,
    SolutionNotFoundError, ProblemNotFoundError, ValidationError,
} from '../error';
import {
    Pdoc, User, Rdoc, PathComponent,
} from '../interface';
import paginate from '../lib/paginate';
import { isTitle, isContent, isPid } from '../lib/validator';
import { ProblemAdd } from '../lib/ui';
import * as problem from '../model/problem';
import * as record from '../model/record';
import * as domain from '../model/domain';
import * as system from '../model/system';
import * as token from '../model/token';
import * as user from '../model/user';
import * as solution from '../model/solution';
import { PERM, PRIV, CONSTANT } from '../model/builtin';
import storage from '../service/storage';
import * as bus from '../service/bus';
import {
    Route, Connection, Handler, ConnectionHandler, Types, param, post, route,
} from '../service/server';

export const parseCategory = (value: string) => flatten(value.split('+').map((e) => e.split(','))).map((e) => e.trim());
export const parsePid = (value: string) => (isSafeInteger(value) ? parseInt(value, 10) : value);

export class ProblemHandler extends Handler {
    async cleanup() {
        if (this.response.template === 'problem_main.html' && this.request.json) {
            const {
                path, page, pcount, ppcount, pdocs, psdict, category,
            } = this.response.body;
            this.response.body = {
                title: this.renderTitle(category),
                fragments: (await Promise.all([
                    this.renderHTML('partials/problem_list.html', {
                        page, ppcount, pcount, pdocs, psdict,
                    }),
                    this.renderHTML('partials/problem_stat.html', { pcount }),
                    this.renderHTML('partials/problem_lucky.html', { category }),
                    this.renderHTML('partials/path.html', { path }),
                ])).map((i) => ({ html: i })),
                raw: {
                    path, page, pcount, ppcount, pdocs, psdict, category,
                },
            };
        }
    }
}

export class ProblemMainHandler extends ProblemHandler {
    @param('page', Types.PositiveInt, true)
    @param('q', Types.String, true)
    async get(domainId: string, page = 1, q = '') {
        this.response.template = 'problem_main.html';
        const query: FilterQuery<Pdoc> = {};
        let psdict = {};
        const path: PathComponent[] = [
            ['Hydro', 'homepage'],
            ['problem_main', null],
        ];
        if (q) {
            query.$text = { $search: q };
            path.push([q, null, null, true]);
        }
        if (!this.user.hasPerm(PERM.PERM_VIEW_PROBLEM_HIDDEN)) query.hidden = false;
        await bus.serial('problem/list', query, this);
        const [pdocs, ppcount, pcount] = await paginate(
            problem.getMulti(domainId, query).sort({ pid: 1, docId: 1 }),
            page,
            CONSTANT.PROBLEM_PER_PAGE,
        );
        if (this.user.hasPriv(PRIV.PRIV_USER_PROFILE)) {
            psdict = await problem.getListStatus(
                domainId, this.user._id, pdocs.map((pdoc) => pdoc.docId),
            );
        }
        this.response.body = {
            path, page, pcount, ppcount, pdocs, psdict, category: q,
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
}

export class ProblemCategoryHandler extends ProblemHandler {
    @param('page', Types.PositiveInt, true)
    @param('category', Types.String, null, parseCategory)
    async get(domainId: string, page = 1, category: string[]) {
        this.response.template = 'problem_main.html';
        const q: any = { $and: [] };
        for (const name of category) {
            q.$and.push({
                $or: [
                    { category: { $elemMatch: { $eq: name } } },
                    { tag: { $elemMatch: { $eq: name } } },
                ],
            });
        }
        let psdict = {};
        if (!this.user.hasPerm(PERM.PERM_VIEW_PROBLEM_HIDDEN)) q.hidden = false;
        await bus.serial('problem/list', q, this);
        const [pdocs, ppcount, pcount] = await paginate(
            problem.getMulti(domainId, q).sort({ pid: 1, docId: 1 }),
            page,
            CONSTANT.PROBLEM_PER_PAGE,
        );
        if (this.user.hasPriv(PRIV.PRIV_USER_PROFILE)) {
            psdict = await problem.getListStatus(
                domainId, this.user._id, pdocs.map((pdoc) => pdoc.docId),
            );
        }
        const path = [
            ['Hydro', 'homepage'],
            ['problem_main', 'problem_main'],
            [category, null, null, true],
        ];
        this.response.body = {
            path, page, pcount, ppcount, pdocs, psdict, category: category.join('+'),
        };
    }
}

export class ProblemRandomHandler extends ProblemHandler {
    @param('category', Types.String, true, null, parseCategory)
    async get(domainId: string, category: string[] = []) {
        const q: any = category.length ? { $and: [] } : {};
        for (const name of category) {
            if (name) {
                q.$and.push({
                    $or: [
                        { category: { $elemMatch: { $eq: name } } },
                        { tag: { $elemMatch: { $eq: name } } },
                    ],
                });
            }
        }
        if (!this.user.hasPerm(PERM.PERM_VIEW_PROBLEM_HIDDEN)) q.hidden = false;
        await bus.serial('problem/list', q, this);
        const pid = await problem.random(domainId, q);
        if (!pid) throw new NoProblemError();
        this.response.body = { pid };
        this.response.redirect = this.url('problem_detail', { pid });
    }
}

export class ProblemDetailHandler extends ProblemHandler {
    pdoc: Pdoc;
    udoc: User;

    @route('pid', Types.String, true, null, parsePid)
    async _prepare(domainId: string, pid: number | string) {
        this.response.template = 'problem_detail.html';
        this.pdoc = await problem.get(domainId, pid, this.user._id);
        if (!this.pdoc) throw new ProblemNotFoundError(domainId, pid);
        if (this.pdoc.hidden && this.pdoc.owner !== this.user._id) {
            this.checkPerm(PERM.PERM_VIEW_PROBLEM_HIDDEN);
        }
        await bus.serial('problem/get', this.pdoc, this);
        this.udoc = await user.getById(domainId, this.pdoc.owner);
        this.response.body = {
            pdoc: this.pdoc,
            udoc: this.udoc,
            title: this.pdoc.title,
            path: [
                ['Hydro', 'homepage'],
                ['problem_main', 'problem_main'],
                [this.pdoc.title, null, true],
            ],
        };
    }

    // eslint-disable-next-line @typescript-eslint/no-unused-vars
    async get(..._args: any[]) {
        // Navigate to current additional file download
        // e.g. ![img](a.jpg) will navigate to ![img](./pid/file/a.jpg)
        if (typeof this.response.body.pdoc.content === 'string') {
            this.response.body.pdoc.content = this.response.body.pdoc.content
                .replace(/\(file:\/\//g, `(./${this.pdoc.docId}/file/`);
        } else {
            this.response.body.pdoc.content = JSON.parse(JSON.stringify(this.response.body.pdoc.content)
                .replace(/\(file:\/\//g, `(./${this.pdoc.docId}/file/`));
        }
    }

    @param('pid', Types.UnsignedInt)
    async postRejudge(domainId: string, pid: number) {
        this.checkPerm(PERM.PERM_REJUDGE_PROBLEM);
        // TODO maybe async?
        await record.getMulti(domainId, { pid }).forEach(async (doc) => {
            await record.reset(domainId, doc._id, true);
            await record.judge(domainId, doc._id, -1);
        });
        this.back();
    }

    async postDelete() {
        if (this.pdoc.owner !== this.user._id) this.checkPerm(PERM.PERM_EDIT_PROBLEM);
        await problem.del(this.pdoc.domainId, this.pdoc.docId);
        this.response.redirect = this.url('problem_main');
    }
}

export class ProblemSubmitHandler extends ProblemDetailHandler {
    @param('pid', Types.String, null, parsePid)
    async get(domainId: string, pid: string | number) {
        this.response.template = 'problem_submit.html';
        const rdocs = await record
            .getUserInProblemMulti(domainId, this.user._id, this.pdoc.docId)
            .sort({ _id: -1 })
            .limit(10)
            .toArray();
        this.response.body = {
            path: [
                ['Hydro', 'homepage'],
                ['problem_main', 'problem_main'],
                [this.pdoc.title, 'problem_detail', { pid }, true],
                ['problem_submit', null],
            ],
            pdoc: this.pdoc,
            udoc: this.udoc,
            rdocs,
            title: this.pdoc.title,
        };
    }

    @param('lang', Types.String)
    @param('code', Types.String)
    async post(domainId: string, lang: string, code: string) {
        const rid = await record.add(domainId, this.pdoc.docId, this.user._id, lang, code, true);
        const [rdoc] = await Promise.all([
            record.get(domainId, rid),
            problem.inc(domainId, this.pdoc.docId, 'nSubmit', 1),
            domain.incUserInDomain(domainId, this.user._id, 'nSubmit'),
        ]);
        bus.boardcast('record/change', rdoc);
        this.response.body = { rid };
        this.response.redirect = this.url('record_detail', { rid });
    }
}

export class ProblemPretestHandler extends ProblemDetailHandler {
    @param('lang', Types.String)
    @param('code', Types.String)
    @param('input', Types.String, true)
    async post(domainId: string, lang: string, code: string, input = '') {
        this.limitRate('add_record', 3600, 100);
        const rid = await record.add(
            domainId, this.pdoc.docId, this.user._id,
            lang, code, true, input,
        );
        const rdoc = await record.get(domainId, rid);
        bus.boardcast('record/change', rdoc);
        this.response.body = { rid };
    }
}

export class ProblemPretestConnectionHandler extends ConnectionHandler {
    pid: string;
    domainId: string;
    dispose: bus.Disposable;

    @param('pid', Types.String)
    async prepare(domainId: string, pid: string) {
        const pdoc = await problem.get(domainId, pid);
        if (!pdoc) throw new ProblemNotFoundError(domainId, pid);
        if (pdoc.hidden) this.checkPerm(PERM.PERM_VIEW_PROBLEM_HIDDEN);
        this.pid = pdoc.docId.toString();
        this.domainId = domainId;
        this.dispose = bus.on('record/change', this.onRecordChange.bind(this));
    }

    async onRecordChange(rdoc: Rdoc) {
        if (
            rdoc.uid !== this.user._id
            || rdoc.pid.toString() !== this.pid
            || rdoc.domainId !== this.domainId
        ) return;
        // TODO handle update
        if (rdoc.contest) return;
        this.send({ rdoc });
    }

    async cleanup() {
        if (this.dispose) this.dispose();
    }
}

export class ProblemStatisticsHandler extends ProblemDetailHandler {
    async get(domainId: string) {
        const udoc = await user.getById(domainId, this.pdoc.owner);
        const path = [
            ['problem_main', 'problem_main'],
            [this.pdoc.title, 'problem_detail', { pid: this.pdoc.pid || this.pdoc.docId }, true],
            ['problem_statistics', null],
        ];
        this.response.template = 'problem_statistics.html';
        this.response.body = { pdoc: this.pdoc, udoc, path };
    }
}

export class ProblemManageHandler extends ProblemDetailHandler {
    async prepare() {
        if (this.pdoc.owner !== this.user._id) this.checkPerm(PERM.PERM_EDIT_PROBLEM);
        else this.checkPerm(PERM.PERM_EDIT_PROBLEM_SELF);
    }
}

export class ProblemSettingsHandler extends ProblemManageHandler {
    @param('pid', Types.String)
    async get(domainId: string, pid: string) {
        this.response.template = 'problem_settings.html';
        this.response.body.path = [
            ['Hydro', 'homepage'],
            ['problem_main', 'problem_main'],
            [this.pdoc.title, 'problem_detail', { pid }, true],
            ['problem_settings', null],
        ];
    }

    @param('pid', Types.String, null, parsePid)
    @param('yaml', Types.String)
    async postConfig(domainId: string, pid: string | number, cfg: string) {
        const pdoc = await problem.get(domainId, pid);
        // TODO validate
        const config = yaml.load(cfg) as any;
        await problem.edit(domainId, pdoc.docId, { config });
        this.back();
    }

    @param('pid', Types.String, null, parsePid)
    @param('hidden', Types.Boolean)
    @param('category', Types.String, true, null, parseCategory)
    @param('tag', Types.String, true, null, parseCategory)
    @param('difficultySetting', Types.UnsignedInt)
    @param('difficultyAdmin', Types.UnsignedInt, true)
    async postSetting(
        domainId: string, pid: string | number, hidden = false,
        category: string[] = [], tag: string[] = [],
        difficultySetting: string, difficultyAdmin: number,
    ) {
        const pdoc = await problem.get(domainId, pid);
        if (!problem.SETTING_DIFFICULTY_RANGE[difficultySetting]) {
            throw new ValidationError('difficultySetting');
        }
        if (!difficultyAdmin) difficultyAdmin = null;
        else if (difficultyAdmin < 1 || difficultyAdmin > 9) throw new ValidationError('difficultyAdmin');
        const update: Partial<Pdoc> = {
            hidden, category, tag, difficultySetting, difficultyAdmin,
        };
        await bus.serial('problem/setting', update, this);
        await problem.edit(domainId, pdoc.docId, update);
        await global.Hydro.script.difficulty.run({ domainId, pid }, console.log);
        this.back();
    }
}

export class ProblemEditHandler extends ProblemManageHandler {
    async get({ pid }) {
        this.response.template = 'problem_edit.html';
        this.response.body.path = [
            ['Hydro', 'homepage'],
            ['problem_main', 'problem_main'],
            [this.pdoc.title, 'problem_detail', { pid }, true],
            ['problem_edit', null],
        ];
    }

    @param('title', Types.String, isTitle)
    @param('content', Types.String, isContent)
    @post('pid', Types.String, isPid, true)
    async post(domainId: string, title: string, content: string, newPid: string = '') {
        try {
            content = JSON.parse(content);
        } catch { /* Ignore */ }
        const $update: Partial<Pdoc> = { title, content, pid: newPid };
        let pdoc = await problem.get(domainId, this.request.params.pid);
        pdoc = await problem.edit(domainId, pdoc.docId, $update);
        this.response.redirect = this.url('problem_detail', { pid: pdoc.pid || pdoc.docId });
    }
}

export class ProblemFilesHandler extends ProblemDetailHandler {
    @param('testdata', Types.Boolean)
    @param('additional_file', Types.Boolean)
    async get(domainId: string, getTestdata = true, getAdditionalFile = true) {
        const canReadData = this.user._id === this.pdoc.owner || this.user.hasPerm(PERM.PERM_READ_PROBLEM_DATA);
        this.response.body.testdata = (getTestdata && canReadData) ? this.pdoc.data : [];
        this.response.body.additional_file = (getAdditionalFile ? this.pdoc.additional_file : []);
        this.response.template = 'problem_files.html';
    }

    @post('files', Types.Set)
    @post('type', Types.Range(['testdata', 'additional_file']), true)
    async postGetLinks(domainId: string, files: Set<string>, type = 'testdata') {
        if (type === 'testdata' && this.user._id !== this.pdoc.owner) {
            this.checkPerm(PERM.PERM_READ_PROBLEM_DATA);
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

    @post('filename', Types.String)
    @post('type', Types.String, true)
    async postUploadFile(domainId: string, filename: string, type = 'testdata') {
        if (!this.request.files.file) throw new ValidationError('file');
        if (this.pdoc.owner !== this.user._id) this.checkPerm(PERM.PERM_EDIT_PROBLEM);
        if (filename === 'testdata.zip') {
            const zip = new AdmZip(this.request.files.file.path);
            const entries = zip.getEntries();
            for (const entry of entries) {
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
        if (this.pdoc.owner !== this.user._id) this.checkPerm(PERM.PERM_EDIT_PROBLEM);
        if (type === 'testdata') await problem.delTestdata(domainId, this.pdoc.docId, files);
        else await problem.delAdditionalFile(domainId, this.pdoc.docId, files);
        this.back();
    }
}

export class ProblemFileDownloadHandler extends ProblemDetailHandler {
    @param('filename', Types.String)
    @param('noDisposition', Types.Boolean)
    async get(domainId: string, filename: string, noDisposition = false) {
        this.response.redirect = await storage.signDownloadLink(
            `problem/${this.pdoc.domainId}/${this.pdoc.docId}/additional_file/${filename}`,
            noDisposition ? undefined : filename, false, 'user',
        );
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
            CONSTANT.SOLUTION_PER_PAGE,
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
        const pssdict = solution.getListStatus(domainId, docids, this.user._id);
        const path = [
            ['problem_main', 'problem_main'],
            [this.pdoc.title, 'problem_detail', { pid: this.pdoc.pid || this.pdoc.docId }, true],
            ['problem_solution', null],
        ];
        this.response.body = {
            path, psdocs, page, pcount, pscount, udict, pssdict, pdoc: this.pdoc,
        };
    }

    @param('content', Types.String, isContent)
    async postSubmit(domainId: string, content: string) {
        this.checkPerm(PERM.PERM_CREATE_PROBLEM_SOLUTION);
        await solution.add(domainId, this.pdoc.docId, this.user._id, content);
        this.back();
    }

    @param('content', Types.String, isContent)
    @param('psid', Types.ObjectID)
    async postEditSolution(domainId: string, content: string, psid: ObjectID) {
        let psdoc = await solution.get(domainId, psid);
        if (psdoc.owner !== this.user._id) this.checkPerm(PERM.PERM_EDIT_PROBLEM_SOLUTION);
        else this.checkPerm(PERM.PERM_EDIT_PROBLEM_SOLUTION_SELF);
        psdoc = await solution.edit(domainId, psdoc.docId, content);
        this.back({ psdoc });
    }

    @param('psid', Types.ObjectID)
    async postDeleteSolution(domainId: string, psid: ObjectID) {
        const psdoc = await solution.get(domainId, psid);
        if (psdoc.owner !== this.user._id) this.checkPerm(PERM.PERM_DELETE_PROBLEM_SOLUTION);
        else this.checkPerm(PERM.PERM_DELETE_PROBLEM_SOLUTION_SELF);
        await solution.del(domainId, psdoc.docId);
        this.back();
    }

    @param('psid', Types.ObjectID)
    @param('content', Types.String, isContent)
    async postReply(domainId: string, psid: ObjectID, content: string) {
        this.checkPerm(PERM.PERM_REPLY_PROBLEM_SOLUTION);
        const psdoc = await solution.get(domainId, psid);
        await solution.reply(domainId, psdoc.docId, this.user._id, content);
        this.back();
    }

    @param('psid', Types.ObjectID)
    @param('psrid', Types.ObjectID)
    @param('content', Types.String, isContent)
    async postEditReply(domainId: string, psid: ObjectID, psrid: ObjectID, content: string) {
        const [psdoc, psrdoc] = await solution.getReply(domainId, psid, psrid);
        if ((!psdoc) || psdoc.pid !== this.pdoc.docId) throw new SolutionNotFoundError(psid);
        if (!(psrdoc.owner === this.user._id
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
        if ((!psdoc) || psdoc.pid !== this.pdoc.docId) throw new SolutionNotFoundError(psid);
        if (!(psrdoc.owner === this.user._id
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
            if ((!psdoc) || psdoc.pid !== this.pdoc.docId) throw new SolutionNotFoundError(psid, psrid);
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
            path: [
                ['Hydro', 'homepage'],
                ['problem_main', 'problem_main'],
                ['problem_create', null],
            ],
            page_name: 'problem_create',
        };
    }

    @param('title', Types.String, isTitle)
    @param('pid', Types.String, isPid, true)
    @param('content', Types.String, isContent)
    @param('hidden', Types.Boolean)
    async post(domainId: string, title: string, pid: string, content: string, hidden = false) {
        try {
            content = JSON.parse(content);
        } catch { /* Ignore */ }
        const docId = await problem.add(
            domainId, pid, title, content,
            this.user._id, [], [], hidden,
        );
        this.response.body = { pid: docId };
        this.response.redirect = this.url('problem_settings', { pid: docId });
    }
}

export class ProblemImportHandler extends Handler {
    async get() {
        this.response.body = { type: 'Hydro' };
        this.response.template = 'problem_import.html';
    }

    async post({ domainId }) {
        if (!this.request.files.file) throw new ValidationError('file');
        const stat = await fs.stat(this.request.files.file.path);
        if (stat.size > 128 * 1024 * 1024) throw new BadRequestError('File too large');
        const zip = new AdmZip(this.request.files.file.path);
        const pdoc = JSON.parse(zip.getEntry('problem.json').getData().toString());
        const pid = await problem.add(domainId, pdoc.pid, pdoc.title, pdoc.content, this.user._id, pdoc.tags, pdoc.category);
        const entries = zip.getEntries();
        for (const entry of entries) {
            if (entry.name.startsWith('testdata/')) {
                // eslint-disable-next-line no-await-in-loop
                await problem.addTestdata(domainId, pid, entry.name.split('testdata/')[1], entry.getData());
            } else if (entry.name.startsWith('additional_file/')) {
                // eslint-disable-next-line no-await-in-loop
                await problem.addAdditionalFile(domainId, pid, entry.name.split('testdata/')[1], entry.getData());
            }
        }
        await problem.edit(domainId, pid, { html: pdoc.html });
        this.response.redirect = this.url('problem_detail', { pid });
    }
}

export class ProblemSendHandler extends Handler {
    async get() {
        this.response.template = 'problem_send.html';
    }

    @post('target', Types.String)
    @post('pids', Types.Array)
    async post(domainId: string, target: any, pids: number[]) {
        target = target.split('@');
        const getHidden = this.user.hasPerm(PERM.PERM_VIEW_PROBLEM_HIDDEN);
        const pdocs = await problem.getList(domainId, pids, getHidden, true);
        const getData = this.user.hasPerm(PERM.PERM_READ_PROBLEM_DATA);
        if (!getData) {
            for (const pid in pdocs) {
                if (pdocs[pid].owner !== this.user._id) {
                    throw new PermissionError(PERM.PERM_READ_PROBLEM_DATA);
                }
            }
        }
        const [source, expire] = system.getMany(['server.url', 'session.expire_seconds']);
        const tokenId = await token.createOrUpdate(token.TYPE_EXPORT, expire, { domainId, pids });
        await superagent.post(`${target[1]}/d/${target[0]}/problem/receive`)
            .send({ source, domainId, tokenId });
        this.back();
    }
}

export async function apply() {
    ProblemAdd('problem_import', {}, 'copy', 'Import From Hydro');
    Route('problem_main', '/p', ProblemMainHandler, PERM.PERM_VIEW_PROBLEM);
    Route('problem_category', '/p/category/:category', ProblemCategoryHandler, PERM.PERM_VIEW_PROBLEM);
    Route('problem_random', '/problem/random', ProblemRandomHandler, PERM.PERM_VIEW_PROBLEM);
    Route('problem_detail', '/p/:pid', ProblemDetailHandler, PERM.PERM_VIEW_PROBLEM);
    Route('problem_submit', '/p/:pid/submit', ProblemSubmitHandler, PERM.PERM_SUBMIT_PROBLEM);
    Route('problem_pretest', '/p/:pid/pretest', ProblemPretestHandler, PERM.PERM_SUBMIT_PROBLEM);
    Route('problem_settings', '/p/:pid/settings', ProblemSettingsHandler);
    Route('problem_statistics', '/p/:pid/statistics', ProblemStatisticsHandler, PERM.PERM_VIEW_PROBLEM);
    Route('problem_edit', '/p/:pid/edit', ProblemEditHandler);
    Route('problem_files', '/p/:pid/files', ProblemFilesHandler, PERM.PERM_VIEW_PROBLEM);
    Route('problem_file_download', '/p/:pid/file/:filename', ProblemFileDownloadHandler, PERM.PERM_VIEW_PROBLEM);
    Route('problem_solution', '/p/:pid/solution', ProblemSolutionHandler, PERM.PERM_VIEW_PROBLEM);
    Route('problem_solution_raw', '/p/:pid/solution/:psid/raw', ProblemSolutionRawHandler, PERM.PERM_VIEW_PROBLEM);
    Route('problem_solution_reply_raw', '/p/:pid/solution/:psid/:psrid/raw', ProblemSolutionRawHandler, PERM.PERM_VIEW_PROBLEM);
    Route('problem_create', '/problem/create', ProblemCreateHandler, PERM.PERM_CREATE_PROBLEM);
    Route('problem_import', '/problem/import', ProblemImportHandler, PERM.PERM_CREATE_PROBLEM);
    Route('problem_send', '/problem/send', ProblemSendHandler, PERM.PERM_VIEW_PROBLEM);
    Connection('problem_pretest_conn', '/conn/pretest', ProblemPretestConnectionHandler, PERM.PERM_SUBMIT_PROBLEM);
}

global.Hydro.handler.problem = apply;
