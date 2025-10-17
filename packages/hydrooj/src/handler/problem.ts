import { createReadStream } from 'fs';
import { PassThrough, Readable, Writable } from 'stream';
import { Entry, ZipReader } from '@zip.js/zip.js';
import { readFile } from 'fs-extra';
import {
    escapeRegExp, flattenDeep, intersection, pick,
} from 'lodash';
import { Filter, ObjectId } from 'mongodb';
import { nanoid } from 'nanoid';
import sanitize from 'sanitize-filename';
import Schema from 'schemastery';
import parser from '@hydrooj/utils/lib/search';
import { randomstring, sortFiles, streamToBuffer } from '@hydrooj/utils/lib/utils';
import type { Context } from '../context';
import {
    BadRequestError, ContestNotAttendedError, ContestNotEndedError, ContestNotFoundError, ContestNotLiveError,
    FileLimitExceededError, FileTooLargeError, HackFailedError, NoProblemError, NotFoundError,
    PermissionError, ProblemAlreadyExistError, ProblemAlreadyUsedByContestError, ProblemConfigError,
    ProblemIsReferencedError, ProblemNotAllowCopyError, ProblemNotAllowLanguageError, ProblemNotAllowPretestError,
    ProblemNotFoundError, RecordNotFoundError, SolutionNotFoundError, ValidationError,
} from '../error';
import {
    ProblemDoc, ProblemSearchOptions, ProblemStatusDoc, RecordDoc, User,
} from '../interface';
import { PERM, PRIV, STATUS } from '../model/builtin';
import * as contest from '../model/contest';
import * as discussion from '../model/discussion';
import domain from '../model/domain';
import * as oplog from '../model/oplog';
import problem from '../model/problem';
import record from '../model/record';
import * as setting from '../model/setting';
import solution from '../model/solution';
import storage from '../model/storage';
import * as system from '../model/system';
import user from '../model/user';
import {
    Handler, param, post, Query, query, route, Types,
} from '../service/server';
import { ContestDetailBaseHandler } from './contest';

export const parseCategory = (value: string) => value.replace(/，/g, ',').split(',').map((e) => e.trim());

function buildQuery(udoc: User) {
    const q: Filter<ProblemDoc> = {};
    if (!udoc.hasPerm(PERM.PERM_VIEW_PROBLEM_HIDDEN)) {
        q.$or = [
            { hidden: false },
            { owner: udoc._id },
            { maintainer: udoc._id },
        ];
    }
    return q;
}

const defaultSearch = async (domainId: string, q: string, options?: ProblemSearchOptions) => {
    const escaped = escapeRegExp(q.toLowerCase());
    const projection: (keyof ProblemDoc)[] = ['domainId', 'docId', 'pid'];
    const $regex = new RegExp(q.length >= 2 ? escaped : `\\A${escaped}`, 'gim');
    const filter = { $or: [{ pid: { $regex } }, { title: { $regex } }, { tag: q }] };
    const pdocs = await problem.getMulti(domainId, filter, projection)
        .skip(options.skip || 0).limit(options.limit || system.get('pagination.problem')).toArray();
    if (!options.skip) {
        let pdoc = await problem.get(domainId, Number.isSafeInteger(+q) ? +q : q, projection);
        if (pdoc) pdocs.unshift(pdoc);
        else if (/^P\d+$/.test(q)) {
            pdoc = await problem.get(domainId, +q.substring(1), projection);
            if (pdoc) pdocs.unshift(pdoc);
        }
    }
    return {
        hits: Array.from(new Set(pdocs.map((i) => `${i.domainId}/${i.docId}`))),
        total: Math.max(pdocs.length, await problem.count(domainId, filter)),
        countRelation: 'eq',
    };
};

export interface QueryContext {
    query: Filter<ProblemDoc>;
    sort: string[];
    pcountRelation: string;
    parsed: ReturnType<typeof parser.parse>;
    category: string[];
    text: string;
    total: number;
    fail: boolean;
    hint: string;
}

export class ProblemMainHandler extends Handler {
    queryContext: QueryContext = {
        query: {},
        sort: [],
        pcountRelation: 'eq',
        parsed: null,
        category: [],
        text: '',
        total: 0,
        fail: false,
        hint: 'sort',
    };

    @param('page', Types.PositiveInt, true)
    @param('q', Types.Content, true)
    @param('limit', Types.PositiveInt, true)
    @param('pjax', Types.Boolean)
    @param('quick', Types.Boolean)
    async get(domainId: string, page = 1, q = '', limit: number, pjax = false, quick = false) {
        this.response.template = 'problem_main.html';
        if (!limit || limit > this.ctx.setting.get('pagination.problem') || page > 1) limit = this.ctx.setting.get('pagination.problem');
        this.queryContext.query = buildQuery(this.user);
        // eslint-disable-next-line ts/no-shadow
        const query = this.queryContext.query;
        const psdict = {};
        const search = Object.values(global.Hydro.module.problemSearch)[0] || defaultSearch;
        const parsed = parser.parse(q, {
            keywords: ['category', 'difficulty', 'namespace'],
            offsets: false,
            alwaysArray: true,
            tokenize: true,
        });
        const category = parsed.category || [];
        const text = (parsed.text || []).join(' ');
        if (parsed.difficulty?.every((i) => Number.isSafeInteger(+i))) {
            query.difficulty = { $in: parsed.difficulty.map(Number) };
        }
        if (category.length) query.$and = category.map((tag) => ({ tag }));
        if (parsed.namespace?.length) {
            const mappedPrefix = this.domain.namespaces?.[parsed.namespace[0]];
            query.$and ||= [];
            if (mappedPrefix) query.$and.push({ sort: new RegExp(`^${mappedPrefix}-`) });
            else query.$and.push({ tag: parsed.namespace[0] });
        }
        if (text) category.push(text);
        if (category.length) this.UiContext.extraTitleContent = category.join(',');
        let total = 0;
        if (text) {
            const result = await search(domainId, q, { skip: (page - 1) * limit, limit });
            total = result.total;
            this.queryContext.pcountRelation = result.countRelation;
            if (!result.hits.length) this.queryContext.fail = true;
            query.docId = { $in: result.hits.map((t) => +t.split('/')[1]) };
            this.queryContext.hint = 'basic';
            this.queryContext.sort = result.hits;
        }
        const sort = this.queryContext.sort;
        await this.ctx.parallel('problem/list', query, this, sort);
        let [pdocs, ppcount, pcount] = this.queryContext.fail
            ? [[], 0, 0]
            : await this.paginate(
                problem.getMulti(domainId, query, quick ? ['title', 'pid', 'domainId', 'docId'] : undefined)
                    .sort({ sort: 1, docId: 1 }).hint(this.queryContext.hint),
                sort.length ? 1 : page, limit,
            );
        if (total) {
            pcount = total;
            ppcount = Math.ceil(total / limit);
        }
        if (sort.length) pdocs = pdocs.sort((a, b) => sort.indexOf(`${a.domainId}/${a.docId}`) - sort.indexOf(`${b.domainId}/${b.docId}`));
        if (text && pcount > pdocs.length) pcount = pdocs.length;
        if (this.user.hasPriv(PRIV.PRIV_USER_PROFILE)) {
            Object.assign(psdict, await problem.getListStatus(
                domainId, this.user._id,
                pdocs.map((i) => i.docId),
            ));
        }
        if (pjax) {
            this.response.body = {
                title: this.renderTitle(this.translate('problem_main')),
                fragments: (await Promise.all([
                    this.renderHTML('partials/problem_list.html', {
                        page, ppcount, pcount, pdocs, psdict, qs: q,
                    }),
                    this.renderHTML('partials/problem_stat.html', { pcount, pcountRelation: this.queryContext.pcountRelation }),
                    this.renderHTML('partials/problem_lucky.html', { qs: q }),
                ])).map((i) => ({ html: i })),
            };
        } else {
            this.response.body = {
                page,
                pcount,
                ppcount,
                pcountRelation: this.queryContext.pcountRelation,
                pdocs,
                psdict,
                qs: q,
            };
        }
    }

    @param('pids', Types.NumericArray)
    @param('target', Types.String)
    @param('hidden', Types.Boolean)
    @param('redirect', Types.Boolean)
    async postCopy(domainId: string, pids: number[], target: string, hidden?: boolean, redirect = false) {
        let t = `,${this.domain.share || ''},`;
        if (t !== ',*,' && !t.includes(`,${target},`)) throw new ProblemNotAllowCopyError(this.domain._id, target);
        const ddoc = await domain.get(target);
        if (!ddoc) throw new NotFoundError(target);
        const dudoc = await user.getById(target, this.user._id);
        if (!dudoc.hasPerm(PERM.PERM_CREATE_PROBLEM)) throw new PermissionError(PERM.PERM_CREATE_PROBLEM);
        if (!pids.length) throw new ValidationError('pids');
        // Check if user can access all those problems
        const pdict = await problem.getList(
            domainId, pids, this.user.hasPerm(PERM.PERM_VIEW_PROBLEM_HIDDEN) || this.user._id,
            true, ['domainId', 'docId', 'reference'], true,
        );
        const ids = [];
        for (const pid of pids) {
            let pdoc = pdict[pid];
            if (pdoc.reference) {
                // eslint-disable-next-line no-await-in-loop
                const [sourcePdoc, sourceDdoc] = await Promise.all([
                    problem.get(pdoc.reference.domainId, pdoc.reference.pid),
                    domain.get(pdoc.reference.domainId),
                ]);
                if (!sourcePdoc) throw new ProblemNotFoundError(pdoc.reference.domainId, pdoc.reference.pid);
                else pdoc = sourcePdoc;
                t = `,${sourceDdoc.share || ''},`;
                if (t !== ',*,' && !t.includes(`,${target},`)) throw new ProblemNotAllowCopyError(sourceDdoc._id, target);
            }
            // eslint-disable-next-line no-await-in-loop
            ids.push(await problem.copy(pdoc.domainId, pdoc.docId, target, undefined, hidden));
        }
        if (redirect) this.response.redirect = this.url('problem_detail', { domainId: target, pid: ids[0] });
        else this.response.body = ids;
    }

    @param('pids', Types.NumericArray)
    async postDelete(domainId: string, pids: number[]) {
        let i = 0;
        for (const pid of pids) {
            // eslint-disable-next-line no-await-in-loop
            const pdoc = await problem.get(domainId, pid);
            if (!pdoc) continue;
            if (!this.user.own(pdoc, PERM.PERM_EDIT_PROBLEM_SELF)) this.checkPerm(PERM.PERM_EDIT_PROBLEM);
            // eslint-disable-next-line no-await-in-loop
            await problem.del(domainId, pid);
            i++;
            this.progress('Deleting: ({0}/{1})', [i, pids.length]);
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

export class ProblemRandomHandler extends Handler {
    @param('q', Types.Content, true)
    async get(domainId: string, qs = '') {
        const category = flattenDeep(qs.split(' ')
            .filter((i) => i.startsWith('category:'))
            .map((i) => i.split('category:')[1]?.split(',')));
        const q = buildQuery(this.user);
        if (category.length) q.$and = category.map((tag) => ({ tag }));
        await this.ctx.parallel('problem/list', q, this);
        const pid = await problem.random(domainId, q);
        if (!pid) throw new NoProblemError();
        this.response.body = { pid };
        this.response.redirect = this.url('problem_detail', { pid });
    }
}

export class ProblemDetailHandler extends ContestDetailBaseHandler {
    pdoc: ProblemDoc;
    udoc: User;
    psdoc: ProblemStatusDoc;

    @route('pid', Types.ProblemId, true)
    @query('tid', Types.ObjectId, true)
    async _prepare(domainId: string, pid: number | string, tid?: ObjectId) {
        this.pdoc = await problem.get(domainId, pid);
        if (!this.pdoc) throw new ProblemNotFoundError(domainId, pid);
        if (tid) {
            if (!this.tdoc?.pids?.includes(this.pdoc.docId)) throw new ContestNotFoundError(domainId, tid);
            if (contest.isNotStarted(this.tdoc)) throw new ContestNotLiveError(tid);
            if (!contest.isDone(this.tdoc, this.tsdoc) && (!this.tsdoc?.attend || !this.tsdoc.startAt)) throw new ContestNotAttendedError(tid);
            // Delete problem-related info in contest mode
            this.pdoc.tag.length = 0;
            delete this.pdoc.nAccept;
            delete this.pdoc.nSubmit;
            delete this.pdoc.difficulty;
            delete this.pdoc.stats;
        } else if (!problem.canViewBy(this.pdoc, this.user)) {
            throw new PermissionError(PERM.PERM_VIEW_PROBLEM_HIDDEN);
        }
        let ddoc = this.domain;
        if (this.pdoc.reference) {
            ddoc = await domain.get(this.pdoc.reference.domainId);
            const pdoc = await problem.get(this.pdoc.reference.domainId, this.pdoc.reference.pid);
            if (!ddoc || !pdoc) throw new ProblemNotFoundError(this.pdoc.reference.domainId, this.pdoc.reference.pid);
            this.pdoc.config = pdoc.config;
            this.pdoc.additional_file = pdoc.additional_file;
        }
        if (typeof this.pdoc.config !== 'string') {
            let baseLangs;
            const t = [];
            if (this.pdoc.config.langs) t.push(this.pdoc.config.langs);
            if (ddoc.langs) t.push(ddoc.langs.split(',').map((i) => i.trim()).filter((i) => i));
            if (this.domain.langs) t.push(this.domain.langs.split(',').map((i) => i.trim()).filter((i) => i));
            if (this.tdoc?.langs?.length) t.push(this.tdoc.langs);
            if (this.pdoc.config.type === 'remote_judge') {
                const p = this.pdoc.config.subType;
                const dl = Object.keys(setting.langs).filter((i) => i.startsWith(`${p}.`) || setting.langs[i].validAs[p]);
                if (setting.langs[p]) dl.push(p);
                baseLangs = dl;
            } else {
                const needHiddenLangs = flattenDeep(t).length;
                baseLangs = Object.keys(setting.langs).filter((i) =>
                    (needHiddenLangs ? !setting.langs[i].remote : !setting.langs[i].remote && !setting.langs[i].hidden));
            }
            this.pdoc.config.langs = ['objective', 'submit_answer'].includes(this.pdoc.config.type) ? ['_'] : intersection(baseLangs, ...t);
        }
        await this.ctx.parallel('problem/get', this.pdoc, this);
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
            psdoc: tid ? null : this.psdoc,
            title: this.pdoc.title,
            solutionCount: scnt,
            discussionCount: dcnt,
            tdoc: this.tdoc,
            owner_udoc: (tid && this.tdoc.owner !== this.pdoc.owner) ? await user.getById(domainId, this.tdoc.owner) : null,
            mode: !tid ? 'normal'
                : !this.tsdoc?.attend ? 'view'
                    : !contest.isDone(this.tdoc) ? 'contest'
                        : problem.canViewBy(this.pdoc, this.user) ? 'correction' : 'none',
        };
        if (this.tdoc && this.tsdoc) {
            const fields = ['attend', 'startAt'];
            if (this.tdoc.duration) fields.push('endAt');
            if (contest.canShowSelfRecord.call(this, this.tdoc, true)) fields.push('detail');
            this.tsdoc = pick(this.tsdoc, fields);
            this.response.body.tsdoc = this.tsdoc;
        }
        this.response.template = 'problem_detail.html';
        this.UiContext.extraTitleContent = this.pdoc.title;
    }

    @query('tid', Types.ObjectId, true)
    @query('pjax', Types.Boolean)
    async get(...args: any[]) {
        // Navigate to current additional file download
        // e.g. ![img](file://a.jpg) will navigate to ![img](./pid/file/a.jpg)
        if (!this.request.json || args[2]) {
            this.response.body.pdoc.content = this.response.body.pdoc.content
                .replace(/file:\/\/([^ \n)\\"]+)/g, (str: string) => {
                    const info = str.match(/file:\/\/([^ \n)\\"]+)/);
                    const fileinfo = info[1];
                    let filename = fileinfo.split('?')[0]; // remove querystring
                    try {
                        filename = decodeURIComponent(filename);
                    } catch (e) { }
                    if (!this.pdoc.additional_file?.find((i) => i.name === filename)) return str;
                    if (!args[1]) return `./${this.pdoc.docId}/file/${fileinfo}`;
                    return `./${this.pdoc.docId}/file/${fileinfo}${fileinfo.includes('?') ? '&' : '?'}tid=${args[1]}`;
                });
        }
        this.response.body.page_name = this.tdoc
            ? this.tdoc.rule === 'homework'
                ? 'homework_detail_problem'
                : 'contest_detail_problem'
            : 'problem_detail';
        if (args[2]) {
            const data = { pdoc: this.pdoc, tdoc: this.tdoc };
            this.response.body = {
                title: this.renderTitle(this.response.body.page_name),
                fragments: [
                    { html: await this.renderHTML('partials/problem_description.html', data) },
                ],
                raw: data,
            };
        }
        if (!this.response.body.tdoc) {
            if (this.psdoc?.rid) {
                this.response.body.rdoc = await record.get(this.args.domainId, this.psdoc.rid);
            }
            [this.response.body.ctdocs, this.response.body.htdocs] = (await Promise.all([
                contest.getRelated(this.args.domainId, this.pdoc.docId),
                contest.getRelated(this.args.domainId, this.pdoc.docId, 'homework'),
            ])).map((tdocs) => tdocs.filter((tdoc) =>
                this.user.hasPerm(PERM.PERM_VIEW_HIDDEN_CONTEST) || !tdoc.assign?.length || Set.intersection(tdoc.assign, this.user.group).size,
            ));
        }
    }

    @param('pid', Types.UnsignedInt)
    async postRejudge(domainId: string, pid: number) {
        this.checkPerm(PERM.PERM_REJUDGE_PROBLEM);
        if (!this.pdoc.config || typeof this.pdoc.config === 'string') throw new ProblemConfigError();
        const rdocs = await record.getMulti(domainId, {
            pid,
            contest: { $nin: [record.RECORD_GENERATE, record.RECORD_PRETEST] },
            status: { $ne: STATUS.STATUS_CANCELED },
            'files.hack': { $exists: false },
        }).project({ _id: 1, contest: 1 }).toArray();
        if (rdocs.length) {
            const priority = await record.submissionPriority(this.user._id, -10000 - rdocs.length * 5 - 50);
            await record.reset(domainId, rdocs.map((rdoc) => rdoc._id), true);
            await Promise.all([
                record.judge(domainId, rdocs.filter((i) => i.contest).map((i) => i._id), priority, { detail: false }, { rejudge: true }),
                record.judge(domainId, rdocs.filter((i) => !i.contest).map((i) => i._id), priority, {}, { rejudge: true }),
            ]);
        }
        this.back();
    }

    async postDelete() {
        if (!this.user.own(this.pdoc, PERM.PERM_EDIT_PROBLEM_SELF)) this.checkPerm(PERM.PERM_EDIT_PROBLEM);
        const tdocs = await contest.getRelated(this.args.domainId, this.pdoc.docId);
        if (tdocs.length) throw new ProblemAlreadyUsedByContestError(this.pdoc.docId, tdocs[0]._id);
        await problem.del(this.pdoc.domainId, this.pdoc.docId);
        this.response.redirect = this.url('problem_main');
    }

    @param('star', Types.Boolean)
    async postStar(domainId: string, star: boolean) {
        await problem.setStar(domainId, this.pdoc.docId, this.user._id, star);
        this.back({ star });
    }
}

export class ProblemSubmitHandler extends ProblemDetailHandler {
    @param('tid', Types.ObjectId, true)
    async prepare(domainId: string, tid?: ObjectId) {
        if (tid && !contest.isOngoing(this.tdoc, this.tsdoc)) throw new ContestNotLiveError(this.tdoc.docId);
        if (typeof this.pdoc.config === 'string') throw new ProblemConfigError();
        if (this.pdoc.config.langs && !this.pdoc.config.langs.length) throw new ProblemConfigError();
    }

    async get() {
        this.response.template = 'problem_submit.html';
        const langRange = (typeof this.pdoc.config === 'object' && this.pdoc.config.langs)
            ? Object.fromEntries(this.pdoc.config.langs.map((i) => [i, setting.langs[i]?.display || i]))
            : setting.SETTINGS_BY_KEY.codeLang.range;
        this.response.body.langRange = langRange;
        this.response.body.page_name = this.tdoc
            ? this.tdoc.rule === 'homework'
                ? 'homework_detail_problem_submit'
                : 'contest_detail_problem_submit'
            : 'problem_submit';
    }

    @param('lang', Types.Name)
    @param('code', Types.String, true)
    @param('pretest', Types.Boolean)
    @param('input', Types.String, true)
    @param('tid', Types.ObjectId, true)
    async post(domainId: string, lang: string, code: string, pretest = false, input = '', tid?: ObjectId) {
        const config = this.pdoc.config;
        if (typeof config === 'string' || config === null) throw new ProblemConfigError();
        if (['submit_answer', 'objective'].includes(config.type)) {
            lang = '_';
        } else if ((config.langs && !config.langs.includes(lang)) || !setting.langs[lang] || setting.langs[lang].disabled) {
            throw new ProblemNotAllowLanguageError();
        }
        if (pretest) {
            if (setting.langs[lang]?.pretest) lang = setting.langs[lang].pretest as string;
            if (!['default', 'remote_judge'].includes(this.response.body.pdoc.config?.type)) {
                throw new ProblemNotAllowPretestError('type');
            }
        }
        await this.limitRate('add_record', 60, system.get('limit.submission_user'), '{{user}}');
        await this.limitRate('add_record', 60, pretest ? system.get('limit.pretest') : system.get('limit.submission'));
        const files: Record<string, string> = {};
        const lengthLimit = system.get('limit.codelength') || 128 * 1024;
        if (!code) {
            const file = this.request.files?.file;
            if (!file || file.size === 0) throw new ValidationError('code');
            const sizeLimit = config.type === 'submit_answer' ? 128 * 1024 * 1024 : lengthLimit;
            if (file.size > sizeLimit) throw new FileTooLargeError('file');
            const shouldReadFile = () => {
                if (config.type === 'objective') return true;
                if (lang === '_') return false;
                return file.size < lengthLimit && !file.filepath.endsWith('.zip') && !setting.langs[lang].isBinary;
            };
            if (shouldReadFile()) code = await readFile(file.filepath, 'utf-8');
            else {
                const id = nanoid();
                await storage.put(`submission/${this.user._id}/${id}`, file.filepath, this.user._id);
                files.code = `${this.user._id}/${id}#${file.originalFilename}`;
            }
        } else if (code.length > lengthLimit) throw new ValidationError('code');
        const rid = await record.add(
            domainId, this.pdoc.docId, this.user._id, lang, code, true,
            pretest ? { input, type: 'pretest' } : { contest: tid, files, type: 'judge' },
        );
        if (!pretest) {
            await Promise.all([
                problem.inc(domainId, this.pdoc.docId, 'nSubmit', 1),
                domain.incUserInDomain(domainId, this.user._id, 'nSubmit'),
                tid && contest.updateStatus(domainId, tid, this.user._id, rid, this.pdoc.docId),
            ]);
        }
        if (tid && !pretest && !contest.canShowSelfRecord.call(this, this.tdoc)) {
            this.response.body = { tid };
            this.response.redirect = this.url(this.tdoc.rule === 'homework' ? 'homework_detail' : 'contest_problemlist', { tid });
        } else {
            this.response.body = { rid };
            this.response.redirect = this.url('record_detail', { rid });
        }
    }
}

export class ProblemHackHandler extends ProblemDetailHandler {
    rdoc: RecordDoc;

    @param('rid', Types.ObjectId)
    @param('tid', Types.ObjectId, true)
    async prepare(domainId: string, rid: ObjectId, tid?: ObjectId) {
        if (typeof this.pdoc.config !== 'object' || !this.pdoc.config.hackable) throw new HackFailedError('This problem is not hackable.');
        this.rdoc = await record.get(domainId, rid);
        if (!this.rdoc || this.rdoc.pid !== this.pdoc.docId
            || this.rdoc.contest?.toString() !== tid?.toString()) throw new RecordNotFoundError(domainId, rid);
        if (tid) {
            if (this.tdoc.rule !== 'codeforces') throw new HackFailedError('This contest is not hackable.');
            if (!contest.isOngoing(this.tdoc, this.tsdoc)) throw new ContestNotLiveError(this.tdoc.docId);
        }
        if (this.rdoc.uid === this.user._id) throw new HackFailedError('You cannot hack your own submission');
        if (this.psdoc?.status !== STATUS.STATUS_ACCEPTED) throw new HackFailedError('You must accept this problem before hacking.');
        if (this.rdoc.status !== STATUS.STATUS_ACCEPTED) throw new HackFailedError('You cannot hack a unsuccessful submission.');
    }

    async get() {
        this.response.template = 'problem_hack.html';
        this.response.body = {
            pdoc: this.pdoc,
            udoc: this.udoc,
            rid: this.rdoc._id,
            title: this.pdoc.title,
            page_name: this.tdoc ? 'contest_detail_problem_hack' : 'problem_hack',
        };
    }

    @param('input', Types.String, true)
    @param('autoOrganizeInput', Types.Boolean, true)
    @param('tid', Types.ObjectId, true)
    async post(domainId: string, input = '', autoOrganizeInput = false, tid?: ObjectId) {
        await this.limitRate('add_record', 60, system.get('limit.submission_user'), '{{user}}');
        await this.limitRate('add_record', 60, system.get('limit.submission'));
        const id = `${this.user._id}/${nanoid()}`;
        if (this.request.files?.file?.size > 0) {
            const file = this.request.files.file;
            if (!file || file.size > 2 * 1024 * 1024) throw new ValidationError('input');
            await storage.put(`submission/${id}`, file.filepath, this.user._id);
        } else if (input) {
            if (autoOrganizeInput) input = input.replace(/\s+\n/g, '\n').replace(/\s+ /g, ' ');
            await storage.put(`submission/${id}`, Buffer.from(input), this.user._id);
        }
        const rid = await record.add(
            domainId, this.pdoc.docId, this.user._id,
            this.rdoc.lang, this.rdoc.code, true,
            {
                contest: tid,
                type: 'hack',
                hackTarget: this.rdoc._id,
                files: { hack: `${id}#input.txt` },
            },
        );
        this.response.body = { rid };
        this.response.redirect = this.url('record_detail', { rid });
    }
}

export class ProblemManageHandler extends ProblemDetailHandler {
    async prepare() {
        if (!this.user.own(this.pdoc, PERM.PERM_EDIT_PROBLEM_SELF)) this.checkPerm(PERM.PERM_EDIT_PROBLEM);
    }
}

export class ProblemEditHandler extends ProblemManageHandler {
    async get() {
        this.response.body.additional_file = sortFiles(this.pdoc.additional_file || []);
        this.response.template = 'problem_edit.html';
    }

    @route('pid', Types.ProblemId)
    @post('title', Types.Title)
    @post('content', Types.Content)
    @post('pid', Types.ProblemId, true, (i) => /^(?:[a-z0-9]{1,10}-)?[a-z][a-z0-9]*$/i.test(i))
    @post('hidden', Types.Boolean)
    @post('tag', Types.Content, true, null, parseCategory)
    @post('difficulty', Types.PositiveInt, (i) => +i <= 10, true)
    async post(
        domainId: string, pid: string | number, title: string, content: string,
        newPid: string | number = '', hidden = false, tag: string[] = [], difficulty = 0,
    ) {
        if (typeof newPid !== 'string') newPid = `P${newPid}`;
        if (newPid !== this.pdoc.pid && await problem.get(domainId, newPid)) throw new ProblemAlreadyExistError(newPid);
        const $update: Partial<ProblemDoc> = {
            title, content, pid: newPid, hidden, tag: tag ?? [], difficulty, html: false,
        };
        const pdoc = await problem.edit(domainId, this.pdoc.docId, $update);
        this.response.redirect = this.url('problem_detail', { pid: newPid || pdoc.docId });
    }
}

export class ProblemConfigHandler extends ProblemManageHandler {
    async get() {
        if (this.pdoc.reference) throw new ProblemIsReferencedError('edit config');
        this.response.body.testdata = sortFiles(this.pdoc.data || []);
        const configFile = (this.pdoc.data || []).filter((i) => i.name.toLowerCase() === 'config.yaml');
        this.response.body.config = '';
        if (configFile.length > 0) {
            try {
                this.response.body.config = (await streamToBuffer(
                    await storage.get(`problem/${this.pdoc.domainId}/${this.pdoc.docId}/testdata/${configFile[0].name}`),
                )).toString();
            } catch (e) { /* ignore */ }
        }
        this.response.template = 'problem_config.html';
    }
}

export class ProblemFilesHandler extends ProblemDetailHandler {
    notUsage = true;

    @param('d', Types.CommaSeperatedArray, true)
    @param('sidebar', Types.Boolean)
    async get({ }, d = ['testdata', 'additional_file'], sidebar = false) {
        if (this.tdoc) throw new ContestNotEndedError();
        this.response.body.testdata = sortFiles(this.pdoc.data || []);
        this.response.body.additional_file = sortFiles(this.pdoc.additional_file || []);
        this.response.body.reference = this.pdoc.reference;
        this.response.pjax = d.map((i) => ['partials/problem_files.html', { filetype: i, sidebar, can_edit: true }]);
        if (!sidebar) this.response.pjax.push(['partials/problem-sidebar-information.html', {}]);
        this.response.template = 'problem_files.html';
    }

    async post() {
        if (this.args.operation === 'get_links') return;
        if (this.pdoc.reference) throw new ProblemIsReferencedError('edit files');
        if (!this.user.own(this.pdoc, PERM.PERM_EDIT_PROBLEM_SELF)) this.checkPerm(PERM.PERM_EDIT_PROBLEM);
    }

    @post('files', Types.Set)
    @post('type', Types.Range(['testdata', 'additional_file']), true)
    async postGetLinks(domainId: string, files: Set<string>, type = 'testdata') {
        if (type === 'testdata' && !this.user.own(this.pdoc)) {
            if (this.pdoc.reference) throw new ProblemIsReferencedError('download testdata.');
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
        await oplog.log(this, 'download.problem.bulk', {
            target: Array.from(files).map((file) => `problem/${this.pdoc.domainId}/${this.pdoc.docId}/${type}/${file}`),
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

    @post('filename', Types.Filename, true)
    @post('type', Types.Range(['testdata', 'additional_file']), true)
    async postUploadFile(domainId: string, filename: string, type = 'testdata') {
        const file = this.request.files.file;
        if (!file) throw new ValidationError('file');
        filename ||= file.originalFilename || randomstring(16);
        const files = [];
        if (filename.endsWith('.zip') && type === 'testdata') {
            const zip = new ZipReader(Readable.toWeb(createReadStream(file.filepath)));
            let entries: Entry[];
            try {
                entries = await zip.getEntries();
            } catch (e) {
                throw new ValidationError('zip', null, e.message);
            }
            for (const entry of entries) {
                if (!entry.filename || entry.directory === true) continue;
                files.push({
                    type,
                    name: sanitize(entry.filename),
                    size: entry.uncompressedSize,
                    data: () => {
                        const pass = new PassThrough();
                        entry.getData(Writable.toWeb(pass));
                        return pass;
                    },
                });
            }
        } else {
            files.push({
                type,
                name: filename,
                size: file.size,
                data: () => file.filepath,
            });
        }
        if (!this.user.hasPriv(PRIV.PRIV_EDIT_SYSTEM)) {
            if ((this.pdoc.data?.length || 0)
                + (this.pdoc.additional_file?.length || 0)
                + files.length
                >= this.ctx.setting.get('limit.problem_files_max')) {
                throw new FileLimitExceededError('count');
            }
            const size = Math.sum(
                (this.pdoc.data || []).map((i) => i.size),
                (this.pdoc.additional_file || []).map((i) => i.size),
                files.map((i) => i.size),
            );
            if (size >= this.ctx.setting.get('limit.problem_files_max_size')) {
                throw new FileLimitExceededError('size');
            }
        }
        for (const entry of files) {
            const method = entry.type === 'testdata' ? 'addTestdata' : 'addAdditionalFile';
            // eslint-disable-next-line no-await-in-loop
            await problem[method](domainId, this.pdoc.docId, entry.name, entry.data(), this.user._id);
        }
        this.back();
    }

    @post('files', Types.ArrayOf(Types.Filename))
    @post('newNames', Types.ArrayOf(Types.Filename))
    @post('type', Types.Range(['testdata', 'additional_file']), true)
    async postRenameFiles(domainId: string, files: string[], newNames: string[], type = 'testdata') {
        if (files.length !== newNames.length) throw new ValidationError('files', 'newNames');
        await Promise.all(files.map(async (file, index) => {
            const newName = newNames[index];
            if (type === 'testdata') await problem.renameTestdata(domainId, this.pdoc.docId, file, newName, this.user._id);
            else await problem.renameAdditionalFile(domainId, this.pdoc.docId, file, newName, this.user._id);
        }));
        this.back();
    }

    @post('files', Types.ArrayOf(Types.Filename))
    @post('type', Types.Range(['testdata', 'additional_file']), true)
    async postDeleteFiles(domainId: string, files: string[], type = 'testdata') {
        if (type === 'testdata') await problem.delTestdata(domainId, this.pdoc.docId, files, this.user._id);
        else await problem.delAdditionalFile(domainId, this.pdoc.docId, files, this.user._id);
        this.back();
    }

    @post('std', Types.Filename)
    @post('gen', Types.Filename)
    async postGenerateTestdata(domainId: string, std: string, gen: string) {
        if (!this.pdoc.data?.find((i) => i.name === std)) throw new BadRequestError();
        if (!this.pdoc.data?.find((i) => i.name === gen)) throw new BadRequestError();
        const rid = await record.add(domainId, this.pdoc.docId, this.user._id, '_', `${gen}\n${std}`, true, {
            type: 'generate',
        });
        this.response.redirect = this.url('record_detail', { rid });
    }
}

export class ProblemFileDownloadHandler extends ProblemDetailHandler {
    @query('type', Types.Range(['additional_file', 'testdata']), true)
    @param('filename', Types.Filename)
    @param('noDisposition', Types.Boolean)
    @query('tid', Types.ObjectId, true)
    async get({ }, type = 'additional_file', filename: string, noDisposition = false, tid: ObjectId) {
        if (!tid) this.checkPerm(PERM.PERM_VIEW_PROBLEM);
        if (this.pdoc.reference) {
            if (type === 'testdata') throw new ProblemIsReferencedError('download testdata');
            this.pdoc = await problem.get(this.pdoc.reference.domainId, this.pdoc.reference.pid);
            if (!this.pdoc) throw new ProblemNotFoundError();
        }
        if (type === 'testdata' && !this.user.own(this.pdoc)) {
            if (!this.user.hasPriv(PRIV.PRIV_READ_PROBLEM_DATA)) this.checkPerm(PERM.PERM_READ_PROBLEM_DATA);
            if (this.tdoc && !contest.isDone(this.tdoc)) throw new ContestNotEndedError(this.tdoc.domainId, this.tdoc.docId);
        }
        const target = `problem/${this.pdoc.domainId}/${this.pdoc.docId}/${type}/${filename}`;
        const file = await storage.getMeta(target);
        await oplog.log(this, 'download.problem.single', {
            target,
            size: file?.size || 0,
        });
        this.response.redirect = await storage.signDownloadLink(
            target, noDisposition ? undefined : filename, false, 'user',
        );
    }
}

export class ProblemSolutionHandler extends ProblemDetailHandler {
    @param('page', Types.PositiveInt, true)
    @param('tid', Types.ObjectId, true)
    @param('sid', Types.ObjectId, true)
    async get(domainId: string, page = 1, tid?: ObjectId, sid?: ObjectId) {
        if (tid) throw new PermissionError(PERM.PERM_VIEW_PROBLEM_SOLUTION);
        this.response.template = 'problem_solution.html';
        const accepted = this.psdoc?.status === STATUS.STATUS_ACCEPTED;
        if (!accepted || !this.user.hasPerm(PERM.PERM_VIEW_PROBLEM_SOLUTION_ACCEPT)) {
            this.checkPerm(PERM.PERM_VIEW_PROBLEM_SOLUTION);
        }

        let [psdocs, pcount, pscount] = await this.paginate(
            solution.getMulti(domainId, this.pdoc.docId),
            page,
            'solution',
        );
        if (sid) {
            psdocs = [await solution.get(domainId, sid)];
            if (!psdocs[0]) throw new SolutionNotFoundError(domainId, sid);
        }
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
            psdocs, page, pcount, pscount, udict, pssdict, pdoc: this.pdoc, sid,
        };
    }

    @param('content', Types.Content)
    async postSubmit(domainId: string, content: string) {
        this.checkPerm(PERM.PERM_CREATE_PROBLEM_SOLUTION);
        const psid = await solution.add(domainId, this.pdoc.docId, this.user._id, content);
        this.back({ psid });
    }

    @param('content', Types.Content)
    @param('psid', Types.ObjectId)
    async postEditSolution(domainId: string, content: string, psid: ObjectId) {
        let psdoc = await solution.get(domainId, psid);
        if (!this.user.own(psdoc)) this.checkPerm(PERM.PERM_EDIT_PROBLEM_SOLUTION);
        else this.checkPerm(PERM.PERM_EDIT_PROBLEM_SOLUTION_SELF);
        psdoc = await solution.edit(domainId, psdoc.docId, content);
        this.back({ psdoc });
    }

    @param('psid', Types.ObjectId)
    async postDeleteSolution(domainId: string, psid: ObjectId) {
        const psdoc = await solution.get(domainId, psid);
        if (!this.user.own(psdoc)) this.checkPerm(PERM.PERM_DELETE_PROBLEM_SOLUTION);
        else this.checkPerm(PERM.PERM_DELETE_PROBLEM_SOLUTION_SELF);
        await solution.del(domainId, psdoc.docId);
        this.back();
    }

    @param('psid', Types.ObjectId)
    @param('content', Types.Content)
    async postReply(domainId: string, psid: ObjectId, content: string) {
        this.checkPerm(PERM.PERM_REPLY_PROBLEM_SOLUTION);
        const psdoc = await solution.get(domainId, psid);
        await solution.reply(domainId, psdoc.docId, this.user._id, content);
        this.back();
    }

    @param('psid', Types.ObjectId)
    @param('psrid', Types.ObjectId)
    @param('content', Types.Content)
    async postEditReply(domainId: string, psid: ObjectId, psrid: ObjectId, content: string) {
        const [psdoc, psrdoc] = await solution.getReply(domainId, psid, psrid);
        if (!psdoc || psdoc.parentId !== this.pdoc.docId) throw new SolutionNotFoundError(domainId, psid);
        if (!this.user.own(psrdoc) || !this.user.hasPerm(PERM.PERM_EDIT_PROBLEM_SOLUTION_REPLY_SELF)) {
            throw new PermissionError(PERM.PERM_EDIT_PROBLEM_SOLUTION_REPLY_SELF);
        }
        await solution.editReply(domainId, psid, psrid, content);
        this.back();
    }

    @param('psid', Types.ObjectId)
    @param('psrid', Types.ObjectId)
    async postDeleteReply(domainId: string, psid: ObjectId, psrid: ObjectId) {
        const [psdoc, psrdoc] = await solution.getReply(domainId, psid, psrid);
        if (!psdoc || psdoc.parentId !== this.pdoc.docId) throw new SolutionNotFoundError(psid);
        if (!this.user.own(psrdoc) || !this.user.hasPerm(PERM.PERM_DELETE_PROBLEM_SOLUTION_REPLY_SELF)) {
            this.checkPerm(PERM.PERM_DELETE_PROBLEM_SOLUTION_REPLY);
        }
        await solution.delReply(domainId, psid, psrid);
        this.back();
    }

    @param('psid', Types.ObjectId)
    async postUpvote(domainId: string, psid: ObjectId) {
        const psdoc = await solution.vote(domainId, psid, this.user._id, 1);
        this.back({ vote: psdoc.vote, user_vote: 1 });
    }

    @param('psid', Types.ObjectId)
    async postDownvote(domainId: string, psid: ObjectId) {
        const psdoc = await solution.vote(domainId, psid, this.user._id, -1);
        this.back({ vote: psdoc.vote, user_vote: -1 });
    }
}

export class ProblemSolutionRawHandler extends ProblemDetailHandler {
    @param('psid', Types.ObjectId)
    @route('psrid', Types.ObjectId, true)
    @param('tid', Types.ObjectId, true)
    async get(domainId: string, psid: ObjectId, psrid?: ObjectId, tid?: ObjectId) {
        if (tid) throw new PermissionError(PERM.PERM_VIEW_PROBLEM_SOLUTION);
        const accepted = this.psdoc?.status === STATUS.STATUS_ACCEPTED;
        if (!accepted || !this.user.hasPerm(PERM.PERM_VIEW_PROBLEM_SOLUTION_ACCEPT)) {
            this.checkPerm(PERM.PERM_VIEW_PROBLEM_SOLUTION);
        }
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

export class ProblemStatisticsHandler extends ProblemDetailHandler {
    @param('sort', Types.Range(Object.keys(record.STAT_QUERY)), true)
    @param('direction', Types.Range([-1, 1]), true)
    @param('lang', Types.String, true)
    @param('page', Types.PositiveInt, true)
    async get(domainId: string, sort = 'time', direction: 1 | -1 = 1, lang?: string, page = 1) {
        if (this.tdoc) throw new ContestNotEndedError();
        const [rsdocs, pcount, rscount] = await this.paginate(
            record.getMultiStat(domainId, {
                pid: this.pdoc.docId,
                ...lang ? { lang } : {},
            }, record.STAT_QUERY[sort][Math.max(direction, 0)]),
            page,
            'record',
        );
        const [udict, udoc] = await Promise.all([
            user.getListForRender(domainId, rsdocs.map((i) => i.uid), this.user.hasPerm(PERM.PERM_VIEW_USER_PRIVATE_INFO)),
            user.getById(domainId, this.pdoc.owner),
        ]);
        this.response.template = 'problem_statistics.html';
        this.response.body = {
            rsdocs, page, pcount, rscount, sort, direction, pdoc: this.pdoc, udict, types: Object.keys(record.STAT_QUERY), udoc,
        };
    }
}

export class ProblemCreateHandler extends Handler {
    async get() {
        this.response.template = 'problem_edit.html';
        this.response.body = {
            page_name: 'problem_create',
            additional_file: [],
        };
    }

    @post('title', Types.Title)
    @post('content', Types.Content)
    @post('pid', Types.ProblemId, true, (i) => /^(?:[a-z0-9]{1,10}-)?[a-z][a-z0-9]*$/i.test(i))
    @post('hidden', Types.Boolean)
    @post('difficulty', Types.PositiveInt, (i) => +i <= 10, true)
    @post('tag', Types.Content, true, null, parseCategory)
    async post(
        domainId: string, title: string, content: string, pid: string | number = '',
        hidden = false, difficulty = 0, tag: string[] = [],
    ) {
        if (typeof pid !== 'string') pid = `P${pid}`;
        if (pid && await problem.get(domainId, pid)) throw new ProblemAlreadyExistError(pid);
        const docId = await problem.add(domainId, pid, title, content, this.user._id, tag ?? [], { hidden, difficulty });
        const files = new Set(Array.from(content.matchAll(/file:\/\/([\w-]+\.[a-zA-Z0-9]+)/g)).map((i) => i[1]));
        const tasks = [];
        for (const file of files) {
            if (this.user._files.find((i) => i.name === file)) {
                tasks.push(
                    storage.rename(`user/${this.user._id}/${file}`, `problem/${domainId}/${docId}/additional_file/${file}`, this.user._id)
                        .then(() => problem.addAdditionalFile(domainId, docId, file, '', this.user._id, true)),
                    user.setById(this.user._id, { _files: this.user._files.filter((i) => i.name !== file) }),
                );
            }
        }
        await Promise.all(tasks);
        this.response.body = { pid: pid || docId };
        this.response.redirect = this.url('problem_files', { pid: pid || docId });
    }
}

export const ProblemApi = {
    problem: Query(
        Schema.object({
            id: Schema.union([Schema.number().step(1), Schema.string()]).required(),
            domainId: Schema.string().required(),
        }),
        async (ctx, args) => {
            const pdoc = await problem.get(args.domainId, args.id);
            if (!pdoc) return null;
            if (pdoc.hidden) ctx.checkPerm(PERM.PERM_VIEW_PROBLEM_HIDDEN);
            return pdoc;
        },
    ),
    problems: Query(
        Schema.object({
            ids: Schema.array(Schema.number().step(1)).required(),
            domainId: Schema.string().required(),
        }),
        async (ctx, args) => {
            const pdocs = await problem.getList(args.domainId, args.ids, ctx.user.hasPerm(PERM.PERM_VIEW_PROBLEM_HIDDEN) || ctx.user._id,
                undefined, undefined, true);
            return args.ids.map((id) => pdocs[+id]).filter((i) => i);
        },
    ),
} as const;

declare module '@hydrooj/framework' {
    interface Apis {
        problem: typeof ProblemApi;
    }
}

export async function apply(ctx: Context) {
    ctx.Route('problem_main', '/p', ProblemMainHandler, PERM.PERM_VIEW_PROBLEM);
    ctx.Route('problem_random', '/problem/random', ProblemRandomHandler, PERM.PERM_VIEW_PROBLEM);
    ctx.Route('problem_detail', '/p/:pid', ProblemDetailHandler);
    ctx.Route('problem_submit', '/p/:pid/submit', ProblemSubmitHandler, PERM.PERM_SUBMIT_PROBLEM);
    ctx.Route('problem_hack', '/p/:pid/hack/:rid', ProblemHackHandler, PERM.PERM_SUBMIT_PROBLEM);
    ctx.Route('problem_edit', '/p/:pid/edit', ProblemEditHandler);
    ctx.Route('problem_config', '/p/:pid/config', ProblemConfigHandler);
    ctx.Route('problem_files', '/p/:pid/files', ProblemFilesHandler, PERM.PERM_VIEW_PROBLEM);
    ctx.Route('problem_file_download', '/p/:pid/file/:filename', ProblemFileDownloadHandler);
    ctx.Route('problem_solution', '/p/:pid/solution', ProblemSolutionHandler, PERM.PERM_VIEW_PROBLEM);
    ctx.Route('problem_solution_detail', '/p/:pid/solution/:sid', ProblemSolutionHandler, PERM.PERM_VIEW_PROBLEM);
    ctx.Route('problem_solution_raw', '/p/:pid/solution/:psid/raw', ProblemSolutionRawHandler, PERM.PERM_VIEW_PROBLEM);
    ctx.Route('problem_solution_reply_raw', '/p/:pid/solution/:psid/:psrid/raw', ProblemSolutionRawHandler, PERM.PERM_VIEW_PROBLEM);
    ctx.Route('problem_statistics', '/p/:pid/stat', ProblemStatisticsHandler, PERM.PERM_VIEW_PROBLEM);
    ctx.Route('problem_create', '/problem/create', ProblemCreateHandler, PERM.PERM_CREATE_PROBLEM);
    await ctx.inject(['api'], ({ api }) => {
        api.provide(ProblemApi);
    });
}
