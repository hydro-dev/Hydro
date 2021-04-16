import { isSafeInteger, flatten } from 'lodash';
import { FilterQuery, ObjectID } from 'mongodb';
import AdmZip from 'adm-zip';
import {
    NoProblemError, PermissionError, ValidationError,
    SolutionNotFoundError, ProblemNotFoundError, BadRequestError,
} from '../error';
import {
    Pdoc, User, Rdoc, PathComponent, ProblemStatusDoc,
} from '../interface';
import paginate from '../lib/paginate';
import { isPid } from '../lib/validator';
import difficultyAlgorithm from '../lib/difficulty';
import { parseConfig } from '../lib/testdataConfig';
import * as system from '../model/system';
import problem from '../model/problem';
import record from '../model/record';
import domain from '../model/domain';
import user from '../model/user';
import solution from '../model/solution';
import { PERM, PRIV } from '../model/builtin';
import storage from '../service/storage';
import * as bus from '../service/bus';
import {
    Route, Connection, Handler, ConnectionHandler, Types, param, post, route, query,
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
    @param('q', Types.Content, true)
    async get(domainId: string, page = 1, q = '') {
        this.response.template = 'problem_main.html';
        // eslint-disable-next-line @typescript-eslint/no-shadow
        const query: FilterQuery<Pdoc> = {};
        let psdict = {};
        const path: PathComponent[] = [
            ['Hydro', 'homepage'],
            ['problem_main', null],
        ];
        const search = global.Hydro.lib.problemSearch;
        let sort: number[];
        if (q) {
            path[1][1] = 'problem_main';
            path.push([`${this.translate('Keyword')}: ${q}`, null, null, true]);
            if (search) {
                const result = await search(domainId, q);
                query.docId = { $in: result };
                sort = result;
            } else query.$text = { $search: q };
        }
        if (!this.user.hasPerm(PERM.PERM_VIEW_PROBLEM_HIDDEN)) query.hidden = false;
        await bus.serial('problem/list', query, this);
        // eslint-disable-next-line prefer-const
        let [pdocs, ppcount, pcount] = await paginate(
            problem.getMulti(domainId, query).sort({ pid: 1, docId: 1 }),
            page,
            system.get('pagination.problem'),
        );
        if (sort) pdocs = pdocs.sort((a, b) => sort.indexOf(a.docId) - sort.indexOf(b.docId));
        if (q && +q) {
            const pdoc = await problem.get(domainId, +q, this.user._id, problem.PROJECTION_LIST);
            if (pdoc) pdocs.unshift(pdoc);
        }
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
    @param('category', Types.Name, null, parseCategory)
    async get(domainId: string, page = 1, category: string[]) {
        this.response.template = 'problem_main.html';
        const q: any = { $and: [] };
        for (const tag of category) q.$and.push({ tag });
        let psdict = {};
        if (!this.user.hasPerm(PERM.PERM_VIEW_PROBLEM_HIDDEN)) q.hidden = false;
        await bus.serial('problem/list', q, this);
        const [pdocs, ppcount, pcount] = await paginate(
            problem.getMulti(domainId, q).sort({ pid: 1, docId: 1 }),
            page,
            system.get('pagination.problem'),
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
        this.extraTitleContent = category.join('+');
    }
}

export class ProblemRandomHandler extends ProblemHandler {
    @param('category', Types.Name, true, null, parseCategory)
    async get(domainId: string, category: string[] = []) {
        const q: FilterQuery<Pdoc> = category.length ? { $and: [] } : {};
        for (const tag of category) q.$and.push({ tag });
        if (!this.user.hasPerm(PERM.PERM_VIEW_PROBLEM_HIDDEN)) q.hidden = false;
        await bus.serial('problem/list', q, this);
        const pid = await problem.random(domainId, q);
        if (!pid) throw new NoProblemError();
        this.response.body = { pid };
        this.response.redirect = this.url('problem_detail', { pid });
    }
}

export interface PdocWithPsdoc extends Pdoc {
    psdoc?: ProblemStatusDoc
}

export class ProblemDetailHandler extends ProblemHandler {
    pdoc: PdocWithPsdoc;
    udoc: User;

    @route('pid', Types.Name, true, null, parsePid)
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
                [this.pdoc.title, null, null, true],
            ],
        };
        this.extraTitleContent = this.pdoc.title;
    }

    // eslint-disable-next-line @typescript-eslint/no-unused-vars
    async get(..._args: any[]) {
        // Navigate to current additional file download
        // e.g. ![img](a.jpg) will navigate to ![img](./pid/file/a.jpg)
        this.response.body.pdoc.content = this.response.body.pdoc.content
            .replace(/\(file:\/\//g, `(./${this.pdoc.docId}/file/`);
        // Get time and memory limit
        try {
            this.response.body.pdoc.config = await parseConfig(this.pdoc.config);
        } catch (e) {
            this.response.body.pdoc.config = `Cannot parse: ${e.message}`;
        }
        if (this.pdoc.psdoc) {
            this.response.body.rdoc = await record.get(this.domainId, this.pdoc.psdoc.rid);
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
    @param('pid', Types.Name, null, parsePid)
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

    @param('lang', Types.Name)
    @param('code', Types.Content)
    async post(domainId: string, lang: string, code: string) {
        await this.limitRate('add_record', 60, 5);
        const rid = await record.add(domainId, this.pdoc.docId, this.user._id, lang, code, true);
        const [rdoc] = await Promise.all([
            record.get(domainId, rid),
            problem.inc(domainId, this.pdoc.docId, 'nSubmit', 1),
            problem.incStatus(domainId, this.pdoc.docId, this.user._id, 'nSubmit', 1),
            domain.incUserInDomain(domainId, this.user._id, 'nSubmit'),
        ]);
        bus.boardcast('record/change', rdoc);
        this.response.body = { rid };
        this.response.redirect = this.url('record_detail', { rid });
    }
}

export class ProblemPretestHandler extends ProblemDetailHandler {
    @param('lang', Types.Name)
    @param('code', Types.Content)
    @param('input', Types.Content, true)
    async post(domainId: string, lang: string, code: string, input = '') {
        await this.limitRate('add_record', 60, 5);
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

    @param('pid', Types.Name)
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

    @route('pid', Types.Name, null, parsePid)
    @post('title', Types.Title)
    @post('content', Types.Content)
    @post('pid', Types.Name, isPid, true)
    @post('hidden', Types.Boolean)
    @post('tag', Types.Content, true, null, parseCategory)
    async post(
        domainId: string, pid: string | number, title: string, content: string,
        newPid: string = '', hidden = false, tag: string[] = [],
    ) {
        if (newPid !== this.pdoc.pid && await problem.get(domainId, newPid)) throw new BadRequestError('new pid exists');
        const $update: Partial<Pdoc> = {
            title, content, pid: newPid, hidden, tag: tag ?? [],
        };
        let pdoc = await problem.get(domainId, pid);
        $update.difficulty = difficultyAlgorithm(pdoc.nSubmit, pdoc.nAccept);
        pdoc = await problem.edit(domainId, pdoc.docId, $update);
        this.response.redirect = this.url('problem_detail', { pid: newPid || pdoc.docId });
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

    @post('filename', Types.Name)
    @post('type', Types.Content, true)
    async postUploadFile(domainId: string, filename: string, type = 'testdata') {
        if (!this.request.files.file) throw new ValidationError('file');
        if (this.pdoc.owner !== this.user._id) this.checkPerm(PERM.PERM_EDIT_PROBLEM);
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
        if (this.pdoc.owner !== this.user._id) this.checkPerm(PERM.PERM_EDIT_PROBLEM);
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
        if (type === 'testdata' && this.user._id !== this.pdoc.owner) this.checkPerm(PERM.PERM_READ_PROBLEM_DATA);
        this.response.redirect = await storage.signDownloadLink(
            `problem/${this.pdoc.domainId}/${this.pdoc.docId}/${type}/${filename}`,
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
        const pssdict = solution.getListStatus(domainId, docids, this.user._id);
        const path = [
            ['problem_main', 'problem_main'],
            [this.pdoc.title, 'problem_detail', { pid: this.pdoc.pid || this.pdoc.docId }, true],
            ['problem_solution', null],
        ];
        this.response.body = {
            path, psdocs, page, pcount, pscount, udict, pssdict, pdoc: this.pdoc,
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

    @post('title', Types.Title)
    @post('content', Types.Content)
    @post('pid', Types.Name, true, isPid)
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
        this.response.body = await problem.getPrefixList(domainId, prefix);
    }
}

export async function apply() {
    Route('problem_main', '/p', ProblemMainHandler, PERM.PERM_VIEW_PROBLEM);
    Route('problem_category', '/p/category/:category', ProblemCategoryHandler, PERM.PERM_VIEW_PROBLEM);
    Route('problem_random', '/problem/random', ProblemRandomHandler, PERM.PERM_VIEW_PROBLEM);
    Route('problem_detail', '/p/:pid', ProblemDetailHandler, PERM.PERM_VIEW_PROBLEM);
    Route('problem_submit', '/p/:pid/submit', ProblemSubmitHandler, PERM.PERM_SUBMIT_PROBLEM);
    Route('problem_pretest', '/p/:pid/pretest', ProblemPretestHandler, PERM.PERM_SUBMIT_PROBLEM);
    Route('problem_statistics', '/p/:pid/statistics', ProblemStatisticsHandler, PERM.PERM_VIEW_PROBLEM);
    Route('problem_edit', '/p/:pid/edit', ProblemEditHandler);
    Route('problem_files', '/p/:pid/files', ProblemFilesHandler, PERM.PERM_VIEW_PROBLEM);
    Route('problem_file_download', '/p/:pid/file/:filename', ProblemFileDownloadHandler, PERM.PERM_VIEW_PROBLEM);
    Route('problem_solution', '/p/:pid/solution', ProblemSolutionHandler, PERM.PERM_VIEW_PROBLEM);
    Route('problem_solution_raw', '/p/:pid/solution/:psid/raw', ProblemSolutionRawHandler, PERM.PERM_VIEW_PROBLEM);
    Route('problem_solution_reply_raw', '/p/:pid/solution/:psid/:psrid/raw', ProblemSolutionRawHandler, PERM.PERM_VIEW_PROBLEM);
    Route('problem_create', '/problem/create', ProblemCreateHandler, PERM.PERM_CREATE_PROBLEM);
    Route('problem_prefix_list', '/problem/list', ProblemPrefixListHandler, PERM.PERM_VIEW_PROBLEM);
    Connection('problem_pretest_conn', '/conn/pretest', ProblemPretestConnectionHandler, PERM.PERM_SUBMIT_PROBLEM);
}

global.Hydro.handler.problem = apply;
