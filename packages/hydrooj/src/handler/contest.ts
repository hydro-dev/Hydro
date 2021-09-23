import AdmZip from 'adm-zip';
import { intersection } from 'lodash';
import { lookup } from 'mime-types';
import moment from 'moment-timezone';
import { ObjectID } from 'mongodb';
import { Time } from '@hydrooj/utils/lib/utils';
import {
    BadRequestError, ContestNotAttendedError, ContestNotFoundError,
    ContestNotLiveError, InvalidTokenError, PermissionError,
    ProblemNotFoundError, RecordNotFoundError, ValidationError,
} from '../error';
import {
    DomainDoc, ProblemDoc, Tdoc, User,
} from '../interface';
import paginate from '../lib/paginate';
import { PERM, PRIV } from '../model/builtin';
import * as contest from '../model/contest';
import domain from '../model/domain';
import message from '../model/message';
import problem from '../model/problem';
import record from '../model/record';
import storage from '../model/storage';
import * as system from '../model/system';
import user from '../model/user';
import * as bus from '../service/bus';
import {
    Handler, param, Route, Types,
} from '../service/server';

export class ContestListHandler extends Handler {
    @param('rule', Types.Range(contest.RULES), true)
    @param('page', Types.PositiveInt, true)
    async get(domainId: string, rule = '', page = 1) {
        const cursor = contest.getMulti(domainId, rule ? { rule } : { rule: { $ne: 'homework' } });
        const qs = rule ? `rule=${rule}` : '';
        const [tdocs, tpcount] = await paginate(cursor, page, system.get('pagination.contest'));
        const tids = [];
        for (const tdoc of tdocs) tids.push(tdoc.docId);
        const tsdict = await contest.getListStatus(domainId, this.user._id, tids);
        this.response.template = 'contest_main.html';
        this.response.body = {
            page, tpcount, qs, rule, tdocs, tsdict,
        };
    }
}

export class ContestDetailHandler extends Handler {
    @param('tid', Types.ObjectID)
    @param('page', Types.PositiveInt, true)
    async get(domainId: string, tid: ObjectID, page = 1) {
        const tdoc = await contest.get(domainId, tid);
        this.response.template = 'contest_detail.html';
        const [tsdoc, pdict] = await Promise.all([
            contest.getStatus(domainId, tdoc.docId, this.user._id),
            problem.getList(domainId, tdoc.pids, true),
        ]);
        const psdict = {};
        let rdict = {};
        let attended: boolean;
        if (tsdoc) {
            attended = tsdoc.attend === 1;
            for (const pdetail of tsdoc.journal || []) psdict[pdetail.pid] = pdetail;
            if (contest.canShowSelfRecord.call(this, tdoc)) {
                const q = [];
                for (const i in psdict) q.push(psdict[i].rid);
                rdict = await record.getList(domainId, q);
            } else {
                for (const i in psdict) rdict[psdict[i].rid] = { _id: psdict[i].rid };
            }
        } else attended = false;
        const udict = await user.getList(domainId, [tdoc.owner]);
        const index = tdoc.pids.map((i) => i.toString());
        for (const key in pdict) {
            pdict[key].tag.length = 0;
            const i = (index.indexOf(key) + 10).toString(36).toUpperCase();
            if (i !== '9') pdict[key].pid = i;
        }
        this.response.body = {
            tdoc, tsdoc, attended, udict, pdict, psdict, rdict, page,
        };
    }

    @param('tid', Types.ObjectID)
    @param('code', Types.String, true)
    async postAttend(domainId: string, tid: ObjectID, code = '') {
        const tdoc = await contest.get(domainId, tid);
        if (contest.isDone(tdoc)) throw new ContestNotLiveError(tid);
        if (tdoc._code && code !== tdoc._code) throw new InvalidTokenError(code);
        await contest.attend(domainId, tid, this.user._id);
        this.back();
    }

    @param('tid', Types.ObjectID)
    async postDelete(domainId: string, tid: ObjectID) {
        const tdoc = await contest.get(domainId, tid);
        if (!this.user.own(tdoc)) this.checkPerm(PERM.PERM_EDIT_CONTEST);
        await contest.del(domainId, tid);
        this.response.redirect = this.url('contest_main');
    }
}

export class ContestBoardcastHandler extends Handler {
    @param('tid', Types.ObjectID)
    async get(domainId: string, tid: ObjectID) {
        const tdoc = await contest.get(domainId, tid);
        if (!this.user.own(tdoc)) throw new PermissionError('Boardcast Message');
        const path = [
            ['Hydro', 'homepage'],
            ['contest_main', 'contest_main'],
            [tdoc.title, 'contest_detail', { tid }, true],
            ['contest_broadcast'],
        ];
        this.response.template = 'contest_broadcast.html';
        this.response.body = path;
    }

    @param('tid', Types.ObjectID)
    @param('content', Types.Content)
    async post(domainId: string, tid: ObjectID, content: string) {
        const tdoc = await contest.get(domainId, tid);
        if (!this.user.own(tdoc)) throw new PermissionError('Boardcast Message');
        const tsdocs = await contest.getMultiStatus(domainId, { docId: tid }).toArray();
        const uids: number[] = Array.from(new Set(tsdocs.map((tsdoc) => tsdoc.uid)));
        await Promise.all(
            uids.map((uid) => message.send(this.user._id, uid, content, message.FLAG_ALERT)),
        );
        this.response.redirect = this.url('contest_detail', { tid });
    }
}

export class ContestScoreboardHandler extends Handler {
    @param('tid', Types.ObjectID)
    @param('page', Types.PositiveInt, true)
    async get(domainId: string, tid: ObjectID, page = 1) {
        const [tdoc, rows, udict, , nPages] = await contest.getScoreboard.call(this, domainId, tid, false, page);
        const path = [
            ['Hydro', 'homepage'],
            ['contest_main', 'contest_main'],
            [tdoc.title, 'contest_detail', { tid }, true],
            ['contest_scoreboard', null],
        ];
        this.response.template = 'contest_scoreboard.html';
        this.response.body = {
            tdoc, rows, path, udict, nPages, page,
        };
    }
}

export class ContestScoreboardDownloadHandler extends Handler {
    @param('tid', Types.ObjectID)
    @param('ext', Types.Range(['csv', 'html']))
    async get(domainId: string, tid: ObjectID, ext: string) {
        await this.limitRate('scoreboard_download', 120, 3);
        const getContent = {
            csv: async (rows) => `\uFEFF${rows.map((c) => (c.map((i) => i.value).join(','))).join('\n')}`,
            html: (rows) => this.renderHTML('contest_scoreboard_download_html.html', { rows }),
        };
        const [tdoc, rows] = await contest.getScoreboard.call(this, domainId, tid, true, 0);
        this.binary(await getContent[ext](rows), `${tdoc.title}.${ext}`);
    }
}

export class ContestEditHandler extends Handler {
    tdoc: Tdoc;

    @param('tid', Types.ObjectID, true)
    async prepare(domainId: string, tid: ObjectID) {
        if (tid) {
            this.tdoc = await contest.get(domainId, tid);
            if (!this.tdoc) throw new ContestNotFoundError(domainId, tid);
            if (!this.user.own(this.tdoc)) this.checkPerm(PERM.PERM_EDIT_CONTEST);
            else this.checkPerm(PERM.PERM_EDIT_CONTEST_SELF);
        } else this.checkPerm(PERM.PERM_CREATE_CONTEST);
    }

    @param('tid', Types.ObjectID, true)
    async get(domainId: string, tid: ObjectID) {
        this.response.template = 'contest_edit.html';
        const rules = {};
        for (const i in contest.RULES) rules[i] = contest.RULES[i].TEXT;
        const path = [
            ['Hydro', 'homepage'],
            ['contest_main', 'contest_main'],
            ...tid
                ? [
                    [this.tdoc.title, 'contest_detail', { tid: this.tdoc.docId }, true],
                    ['contest_edit', null],
                ]
                : [['contest_create', null]],
        ];
        let ts = new Date().getTime();
        ts = ts - (ts % (15 * Time.minute)) + 15 * Time.minute;
        const dt = this.tdoc?.beginAt || new Date(ts);
        this.response.body = {
            rules,
            tdoc: this.tdoc,
            duration: tid ? (this.tdoc.endAt.getTime() - this.tdoc.beginAt.getTime()) / Time.hour : 2,
            path,
            pids: tid ? this.tdoc.pids.join(',') : '',
            date_text: dt.format('%Y-%m-%d'),
            time_text: dt.format('%H:%M'),
            page_name: tid ? 'contest_edit' : 'contest_create',
        };
    }

    @param('tid', Types.ObjectID, true)
    @param('beginAtDate', Types.Date)
    @param('beginAtTime', Types.Time)
    @param('duration', Types.Float)
    @param('title', Types.Title)
    @param('content', Types.Content)
    @param('rule', Types.Range(contest.RULES))
    @param('pids', Types.Content)
    @param('rated', Types.Boolean)
    @param('code', Types.String, true)
    async post(
        domainId: string, tid: ObjectID, beginAtDate: string, beginAtTime: string, duration: number,
        title: string, content: string, rule: string, _pids: string, rated = false, _code = '',
    ) {
        const pids = _pids.replace(/，/g, ',').split(',').map((i) => {
            i = i.trim();
            if ((+i).toString() === i) return +i;
            if (i.split(':')[0] === domainId) return +i.split(':')[1];
            if (!i.includes(':')) throw new ValidationError('pids');
            return i;
        }).filter((i) => i);
        const beginAtMoment = moment.tz(`${beginAtDate} ${beginAtTime}`, this.user.timeZone);
        if (!beginAtMoment.isValid()) throw new ValidationError('beginAtDate', 'beginAtTime');
        const endAt = beginAtMoment.clone().add(duration, 'hours').toDate();
        if (beginAtMoment.isSameOrAfter(endAt)) throw new ValidationError('duration');
        const beginAt = beginAtMoment.toDate();
        await problem.getList(domainId, pids, this.user.hasPerm(PERM.PERM_VIEW_PROBLEM_HIDDEN) || this.user._id, true);
        if (tid) {
            await contest.edit(domainId, tid, {
                title, content, rule, beginAt, endAt, pids, rated,
            });
            if (this.tdoc.beginAt !== beginAt || this.tdoc.endAt !== endAt
                || Array.isDiff(this.tdoc.pids, pids) || this.tdoc.rule !== rule) {
                await contest.recalcStatus(domainId, this.tdoc.docId);
            }
        } else {
            tid = await contest.add(domainId, title, content, this.user._id, rule, beginAt, endAt, pids, rated);
        }
        await contest.edit(domainId, tid, { _code });
        this.response.body = { tid };
        this.response.redirect = this.url('contest_detail', { tid });
    }
}

export class ContestProblemHandler extends Handler {
    tdoc: Tdoc<30>;
    pdoc: ProblemDoc;
    tsdoc: any;
    udoc: User;
    attended: boolean;

    @param('tid', Types.ObjectID)
    @param('pid', Types.Name)
    async _prepare(domainId: string, tid: ObjectID, _pid: string) {
        this.tdoc = await contest.get(domainId, tid);
        const pid = this.tdoc.pids[parseInt(_pid, 36) - 10];
        if (!pid) throw new ProblemNotFoundError(domainId, tid, _pid);
        [this.pdoc, this.tsdoc, this.udoc] = await Promise.all([
            problem.get(domainId, pid),
            contest.getStatus(domainId, tid, this.user._id),
            user.getById(domainId, this.tdoc.owner),
        ]);
        if (!this.pdoc) throw new ProblemNotFoundError(domainId, pid);
        this.pdoc.pid = _pid;
        this.pdoc.tag.length = 0;
        // @ts-ignore
        if (this.pdoc.domainId !== domainId) this.pdoc.docId = `${this.pdoc.domainId}:${this.pdoc.docId}`;
        this.attended = this.tsdoc && this.tsdoc.attend === 1;
        const showAccept = contest.canShowScoreboard.call(this, this.tdoc, true);
        if (!showAccept) this.pdoc.nAccept = 0;
        if (contest.isNotStarted(this.tdoc)) throw new ContestNotLiveError(tid);
        if (!contest.isDone(this.tdoc) && !this.attended) throw new ContestNotAttendedError(tid);
        this.response.template = 'problem_detail.html';
        this.response.body = {
            showAccept,
            tdoc: this.tdoc,
            tsdoc: this.tsdoc,
            pdoc: this.pdoc,
            udoc: this.udoc,
            attended: this.attended,
            page_name: 'contest_detail_problem',
        };
    }

    @param('tid', Types.ObjectID)
    @param('pid', Types.Name)
    async get(...args: any[]) {
        this.response.body.path = [
            ['Hydro', 'homepage'],
            ['contest_main', 'contest_main'],
            [this.tdoc.title, 'contest_detail', { tid: args[1] }, true],
            [this.pdoc.title, null, null, true],
        ];
        // Navigate to current additional file download
        // e.g. ![img](a.jpg) will navigate to ![img](./pid/file/a.jpg)
        this.response.body.pdoc.content = this.response.body.pdoc.content
            .replace(/\(file:\/\//g, `(./${args[2]}/file/`)
            .replace(/="file:\/\//g, `="./${args[2]}/file/`);
    }
}

export class ContestProblemFileDownloadHandler extends ContestProblemHandler {
    @param('filename', Types.Name)
    @param('noDisposition', Types.Boolean)
    async get(domainId: string, filename: string, noDisposition = false) {
        // @ts-ignore
        if (typeof this.pdoc.docId === 'string') this.pdoc.docId = this.pdoc.docId.split(':')[1];
        const target = `problem/${this.pdoc.domainId}/${this.pdoc.docId}/additional_file/${filename}`;
        const file = await storage.getMeta(target);
        if (!file) {
            this.response.redirect = await storage.signDownloadLink(
                target, noDisposition ? undefined : filename, false, 'user',
            );
            return;
        }
        const type = lookup(filename).toString();
        const shouldProxy = ['image', 'video', 'audio', 'pdf', 'vnd'].filter((i) => type.includes(i)).length;
        if (shouldProxy && file.size! < 32 * 1024 * 1024) {
            this.response.etag = file.etag;
            this.response.body = await storage.get(target);
            this.response.type = file['Content-Type'] || type;
            this.response.disposition = `attachment; filename=${encodeURIComponent(filename)}`;
        } else {
            this.response.redirect = await storage.signDownloadLink(
                target, noDisposition ? undefined : filename, false, 'user',
            );
        }
    }
}

export class ContestDetailProblemSubmitHandler extends ContestProblemHandler {
    pdomainId: string;
    ppid: number;
    pdomain: DomainDoc;

    @param('pid', Types.Name)
    async prepare(domainId: string, _pid: string) {
        const pid = this.tdoc.pids[parseInt(_pid, 36) - 10];
        if (!this.attended) throw new ContestNotAttendedError(this.tdoc.docId);
        if (!contest.isOngoing(this.tdoc)) throw new ContestNotLiveError(this.tdoc.docId);
        this.pdomainId = typeof pid === 'string' ? pid.split(':')[0] : domainId;
        this.ppid = typeof pid === 'number' ? pid : +pid.split(':')[1];
        this.pdomain = await domain.get(this.pdomainId);
        if (this.pdomain.langs) {
            this.response.body.pdoc.config.langs = intersection(
                this.response.body.pdoc.config.langs || this.pdomain.langs.split(','),
                this.pdomain.langs.split(','),
            );
        }
        this.response.body.pdoc.config.domainId = this.pdomainId;
    }

    @param('tid', Types.ObjectID)
    @param('pid', Types.Name)
    async get(domainId: string, tid: ObjectID, pid: string) {
        this.response.body.path = [
            ['Hydro', 'homepage'],
            ['contest_main', 'contest_main'],
            [this.tdoc.title, 'contest_detail', { tid }, true],
            [this.pdoc.title, 'contest_detail_problem', { tid, pid }, true],
            ['contest_detail_problem_submit', null],
        ];
        this.response.body.page_name = 'contest_detail_problem_submit';
        this.response.template = 'problem_submit.html';
    }

    @param('tid', Types.ObjectID)
    @param('lang', Types.Name)
    @param('code', Types.Content)
    @param('pid', Types.Name)
    @param('pretest', Types.Boolean)
    @param('input', Types.String, true)
    async post(domainId: string, tid: ObjectID, lang: string, code: string, _pid: string, pretest = false, input = '') {
        const pid = this.tdoc.pids[parseInt(_pid, 36) - 10];
        if (!(this.response.body.pdoc.config.langs || [lang]).includes(lang)) {
            throw new BadRequestError('Language not allowed.');
        }
        await this.limitRate('add_record', 60, system.get('limit.submission'));
        const rid = await record.add(domainId, pid, this.user._id, lang, code, true, pretest ? input : tid);
        const rdoc = await record.get(domainId, rid);
        if (!rdoc) throw new RecordNotFoundError(domainId, rid);
        if (!pretest) {
            await Promise.all([
                (this.tsdoc.journal || []).filter((i) => i.pid === pid).length
                && problem.inc(this.pdomainId, this.ppid, 'nSubmit', 1),
                domain.incUserInDomain(domainId, this.user._id, 'nSubmit'),
                contest.updateStatus(domainId, tid, this.user._id, rid, pid),
            ]);
        }
        bus.broadcast('record/change', rdoc);
        if (!pretest && !contest.canShowSelfRecord.call(this, this.tdoc)) {
            this.response.body = { tid };
            this.response.redirect = this.url('contest_detail', { tid });
        } else {
            this.response.body = { rid };
            this.response.redirect = this.url('record_detail', { rid });
        }
    }
}

export class ContestCodeHandler extends Handler {
    @param('tid', Types.ObjectID)
    async get(domainId: string, tid: ObjectID) {
        await this.limitRate('contest_code', 3600, 60);
        const [tdoc, tsdocs] = await contest.getAndListStatus(domainId, tid);
        if (!this.user.own(tdoc) && !this.user.hasPriv(PRIV.PRIV_READ_RECORD_CODE)) {
            this.checkPerm(PERM.PERM_READ_RECORD_CODE);
        }
        if (!contest.canShowRecord.call(this, tdoc as any, true)) {
            throw new PermissionError(PERM.PERM_VIEW_CONTEST_HIDDEN_SCOREBOARD);
        }
        const rnames = {};
        for (const tsdoc of tsdocs) {
            for (const pid in tsdoc.detail || {}) {
                rnames[tsdoc.detail[pid].rid] = `U${tsdoc.uid}_P${pid}_R${tsdoc.detail[pid].rid}`;
            }
        }
        const zip = new AdmZip();
        const rdocs = await record.getMulti(domainId, {
            _id: { $in: Array.from(Object.keys(rnames)).map((id) => new ObjectID(id)) },
        }).toArray();
        for (const rdoc of rdocs) {
            zip.addFile(`${rnames[rdoc._id.toHexString()]}.${rdoc.lang}`, Buffer.from(rdoc.code));
        }
        this.binary(zip.toBuffer(), `${tdoc.title}.zip`);
    }
}

export async function apply() {
    Route('contest_create', '/contest/create', ContestEditHandler);
    Route('contest_main', '/contest', ContestListHandler, PERM.PERM_VIEW_CONTEST);
    Route('contest_detail', '/contest/:tid', ContestDetailHandler, PERM.PERM_VIEW_CONTEST);
    Route('contest_broadcast', '/contest/:tid/broadcast', ContestBoardcastHandler);
    Route('contest_edit', '/contest/:tid/edit', ContestEditHandler, PERM.PERM_VIEW_CONTEST);
    Route('contest_scoreboard', '/contest/:tid/scoreboard', ContestScoreboardHandler, PERM.PERM_VIEW_CONTEST);
    Route('contest_scoreboard_download', '/contest/:tid/export/:ext', ContestScoreboardDownloadHandler, PERM.PERM_VIEW_CONTEST);
    Route('contest_detail_problem', '/contest/:tid/p/:pid', ContestProblemHandler, PERM.PERM_VIEW_CONTEST);
    Route('contest_detail_problem_file_download', '/contest/:tid/p/:pid/file/:filename', ContestProblemFileDownloadHandler, PERM.PERM_VIEW_PROBLEM);
    Route('contest_detail_problem_submit', '/contest/:tid/p/:pid/submit', ContestDetailProblemSubmitHandler, PERM.PERM_VIEW_CONTEST);
    Route('contest_code', '/contest/:tid/code', ContestCodeHandler, PERM.PERM_VIEW_CONTEST);
}

global.Hydro.handler.contest = apply;
