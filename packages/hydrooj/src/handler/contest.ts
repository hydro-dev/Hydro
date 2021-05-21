import moment from 'moment-timezone';
import { ObjectID } from 'mongodb';
import AdmZip from 'adm-zip';
import {
    ContestNotLiveError, ValidationError, ProblemNotFoundError,
    ContestNotAttendedError, PermissionError, BadRequestError,
} from '../error';
import { ProblemDoc, Tdoc, User } from '../interface';
import paginate from '../lib/paginate';
import { parseConfig } from '../lib/testdataConfig';
import { PERM, PRIV } from '../model/builtin';
import * as contest from '../model/contest';
import * as system from '../model/system';
import * as document from '../model/document';
import problem from '../model/problem';
import domain from '../model/domain';
import record from '../model/record';
import user from '../model/user';
import message from '../model/message';
import {
    Route, Handler, Types, param, query,
} from '../service/server';
import * as bus from '../service/bus';
import storage from '../service/storage';

class ContestListHandler extends Handler {
    @param('rule', Types.Range(contest.RULES), true)
    @param('page', Types.PositiveInt, true)
    async get(domainId: string, rule = '', page = 1) {
        this.response.template = 'contest_main.html';
        let tdocs;
        let qs;
        let tpcount;
        if (!rule) {
            tdocs = contest.getMulti(domainId).sort({ beginAt: -1 });
            qs = '';
        } else {
            tdocs = contest.getMulti(domainId, { rule }).sort({ beginAt: -1 });
            qs = `rule=${rule}`;
        }
        // eslint-disable-next-line prefer-const
        [tdocs, tpcount] = await paginate(tdocs, page, system.get('pagination.contest'));
        const tids = [];
        for (const tdoc of tdocs) tids.push(tdoc.docId);
        const tsdict = await contest.getListStatus(domainId, this.user._id, tids);
        const path = [
            ['Hydro', 'homepage'],
            ['contest_main', null],
        ];
        this.response.body = {
            page, tpcount, qs, rule, tdocs, tsdict, path,
        };
    }
}

class ContestDetailHandler extends Handler {
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
            if (contest.canShowRecord.call(this, tdoc)) {
                const q = [];
                for (const i in psdict) q.push(psdict[i].rid);
                rdict = await record.getList(domainId, q, true);
            } else {
                for (const i in psdict) rdict[psdict[i].rid] = { _id: psdict[i].rid };
            }
        } else attended = false;
        const udict = await user.getList(domainId, [tdoc.owner]);
        const path = [
            ['Hydro', 'homepage'],
            ['contest_main', 'contest_main'],
            [tdoc.title, null, null, true],
        ];
        this.response.body = {
            path, tdoc, tsdoc, attended, udict, pdict, psdict, rdict, page,
        };
    }

    @param('tid', Types.ObjectID)
    async postAttend(domainId: string, tid: ObjectID) {
        const tdoc = await contest.get(domainId, tid);
        if (contest.isDone(tdoc)) throw new ContestNotLiveError(tid);
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

class ContestBoardcastHandler extends Handler {
    @param('tid', Types.ObjectID)
    async get(domainId: string, tid: ObjectID) {
        const tdoc = await contest.get(domainId, tid);
        if (!this.user.own(tdoc)) throw new PermissionError('Boardcast Message');
        const path = [
            ['Hydro', 'homepage'],
            ['contest_main', 'contest_main'],
            [tdoc.title, 'contest_detail', { tid }, true],
            ['contest_boardcast'],
        ];
        this.response.template = 'contest_boardcast.html';
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

class ContestScoreboardHandler extends Handler {
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

class ContestScoreboardDownloadHandler extends Handler {
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

class ContestEditHandler extends Handler {
    tdoc: Tdoc;

    @param('tid', Types.ObjectID)
    async prepare(domainId: string, tid: ObjectID) {
        this.tdoc = await contest.get(domainId, tid);
        if (!this.user.own(this.tdoc)) this.checkPerm(PERM.PERM_EDIT_CONTEST);
        else this.checkPerm(PERM.PERM_EDIT_CONTEST_SELF);
    }

    async get() {
        this.response.template = 'contest_edit.html';
        const rules = {};
        for (const i in contest.RULES) {
            rules[i] = contest.RULES[i].TEXT;
        }
        const duration = (this.tdoc.endAt.getTime() - this.tdoc.beginAt.getTime()) / 3600 / 1000;
        const path = [
            ['Hydro', 'homepage'],
            ['contest_main', 'contest_main'],
            [this.tdoc.title, 'contest_detail', { tid: this.tdoc.docId }, true],
            ['contest_edit', null],
        ];
        const dt = this.tdoc.beginAt;
        this.response.body = {
            rules,
            tdoc: this.tdoc,
            duration,
            path,
            pids: this.tdoc.pids.join(','),
            date_text: dt.format('%Y-%m-%d'),
            time_text: dt.format('%H:%M'),
            page_name: 'contest_edit',
        };
    }

    @param('beginAtDate', Types.Date)
    @param('beginAtTime', Types.Time)
    @param('duration', Types.Float)
    @param('title', Types.Title)
    @param('content', Types.Content)
    @param('rule', Types.Range(contest.RULES))
    @param('pids', Types.Content)
    @param('rated', Types.Boolean)
    async post(
        domainId: string, beginAtDate: string, beginAtTime: string, duration: number,
        title: string, content: string, rule: string, _pids: string, rated = false,
    ) {
        const pids = _pids.replace(/，/g, ',').split(',').map((i) => +i).filter((i) => i);
        await problem.getList(domainId, pids, this.user.hasPerm(PERM.PERM_VIEW_PROBLEM_HIDDEN), true);
        const beginAtMoment = moment.tz(`${beginAtDate} ${beginAtTime}`, this.user.timeZone);
        if (!beginAtMoment.isValid()) {
            throw new ValidationError('beginAtDate', 'beginAtTime');
        }
        const endAt = beginAtMoment.clone().add(duration, 'hours').toDate();
        if (beginAtMoment.isSameOrAfter(endAt)) throw new ValidationError('duration');
        const beginAt = beginAtMoment.toDate();
        await contest.edit(domainId, this.tdoc.docId, {
            title, content, rule, beginAt, endAt, pids, rated,
        });
        if (this.tdoc.beginAt !== beginAt || this.tdoc.endAt !== endAt
            || Array.isDiff(this.tdoc.pids, pids) || this.tdoc.rule !== rule) {
            await contest.recalcStatus(domainId, this.tdoc.docId);
        }
        this.response.body = { tid: this.tdoc.docId };
        this.response.redirect = this.url('contest_detail', { tid: this.tdoc.docId });
    }
}

class ContestProblemHandler extends Handler {
    tdoc: Tdoc<30 | 60>;
    pdoc: ProblemDoc;
    tsdoc: any;
    udoc: User;
    attended: boolean;

    @param('tid', Types.ObjectID)
    @param('pid', Types.UnsignedInt)
    async _prepare(domainId: string, tid: ObjectID, pid: number) {
        [this.tdoc, this.pdoc] = await Promise.all([
            contest.get(domainId, tid),
            problem.get(domainId, pid, this.user._id),
        ]);
        [this.tsdoc, this.udoc] = await Promise.all([
            contest.getStatus(domainId, this.tdoc.docId, this.user._id),
            user.getById(domainId, this.tdoc.owner),
        ]);
        this.attended = this.tsdoc && this.tsdoc.attend === 1;
        this.response.template = 'problem_detail.html';
        if (!contest.isDone(this.tdoc)) {
            if (!this.attended) throw new ContestNotAttendedError(this.tdoc.docId);
            if (contest.isNotStarted(this.tdoc)) throw new ContestNotLiveError(this.tdoc.docId);
        }
        if (!this.tdoc.pids.map((s) => s.toString()).includes(this.pdoc.docId.toString())) {
            throw new ProblemNotFoundError(domainId, this.tdoc.docId);
        }
        this.response.body = {
            tdoc: this.tdoc,
            tsdoc: this.tsdoc,
            pdoc: this.pdoc,
            udoc: this.udoc,
            attended: this.attended,
            page_name: 'contest_detail_problem',
        };
    }

    // eslint-disable-next-line
    async get(...args: any[]) {
        this.response.body.path = [
            ['Hydro', 'homepage'],
            ['contest_main', 'contest_main'],
            [this.tdoc.title, 'contest_detail', { tid: this.tdoc.docId }, true],
            [this.pdoc.title, null, null, true],
        ];
        // Navigate to current additional file download
        // e.g. ![img](a.jpg) will navigate to ![img](./pid/file/a.jpg)
        this.response.body.pdoc.content = this.response.body.pdoc.content
            .replace(/\(file:\/\//g, `(./${this.pdoc.docId}/file/`);
        try {
            this.response.body.pdoc.config = await parseConfig(this.pdoc.config);
        } catch (e) {
            this.response.body.pdoc.config = `Cannot parse: ${e.message}`;
        }
    }
}

export class ContestProblemFileDownloadHandler extends ContestProblemHandler {
    @query('type', Types.Range(['additional_file', 'testdata']), true)
    @param('filename', Types.Name)
    @param('noDisposition', Types.Boolean)
    async get(domainId: string, type = 'additional_file', filename: string, noDisposition = false) {
        if (type === 'testdata' && !this.user.own(this.pdoc)) {
            if (!this.user.hasPriv(PRIV.PRIV_READ_PROBLEM_DATA)) this.checkPerm(PERM.PERM_READ_PROBLEM_DATA);
        }
        this.response.redirect = await storage.signDownloadLink(
            `problem/${this.pdoc.domainId}/${this.pdoc.docId}/${type}/${filename}`,
            noDisposition ? undefined : filename, false, 'user',
        );
    }
}

class ContestDetailProblemSubmitHandler extends ContestProblemHandler {
    async prepare() {
        if (!contest.isOngoing(this.tdoc)) throw new ContestNotLiveError(this.tdoc.docId);
    }

    @param('tid', Types.ObjectID)
    @param('pid', Types.UnsignedInt)
    async get(domainId: string, tid: ObjectID, pid: number) {
        this.response.body.rdocs = [];
        if (contest.canShowRecord.call(this, this.tdoc)) {
            this.response.body.rdocs = await record.getUserInProblemMulti(
                domainId, this.user._id,
                this.pdoc.docId, true,
            ).sort({ _id: -1 }).limit(10).toArray();
        }
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
    async post(domainId: string, tid: ObjectID, lang: string, code: string) {
        if (this.response.body.pdoc.config.langs && !this.response.body.pdoc.config.langs.includes('lang')) {
            throw new BadRequestError('Language not allowed.');
        }
        await this.limitRate('add_record', 60, 10);
        const rid = await record.add(domainId, this.pdoc.docId, this.user._id, lang, code, true, {
            type: document.TYPE_CONTEST,
            tid,
        });
        const [rdoc] = await Promise.all([
            record.get(domainId, rid),
            problem.inc(domainId, this.pdoc.docId, 'nSubmit', 1),
            domain.incUserInDomain(domainId, this.user._id, 'nSubmit'),
            contest.updateStatus(domainId, this.tdoc.docId, this.user._id, rid, this.pdoc.docId),
        ]);
        bus.boardcast('record/change', rdoc);
        if (!contest.canShowRecord.call(this, this.tdoc)) {
            this.response.body = { tid };
            this.response.redirect = this.url('contest_detail', { tid });
        } else {
            this.response.body = { rid };
            this.response.redirect = this.url('record_detail', { rid });
        }
    }
}

class ContestCodeHandler extends Handler {
    @param('tid', Types.ObjectID)
    async get(domainId: string, tid: ObjectID) {
        if (!this.user.hasPriv(PRIV.PRIV_READ_RECORD_CODE)) {
            this.checkPerm(PERM.PERM_READ_RECORD_CODE);
        }
        await this.limitRate('homework_code', 3600, 60);
        const [tdoc, tsdocs] = await contest.getAndListStatus(domainId, tid);
        const rnames = {};
        for (const tsdoc of tsdocs) {
            for (const pdetail of tsdoc.detail || []) {
                rnames[pdetail.rid] = `U${tsdoc.uid}_P${pdetail.pid}_R${pdetail.rid}`;
            }
        }
        const zip = new AdmZip();
        const rdocs = await record.getMulti(domainId, {
            _id: {
                $in: Array.from(Object.keys(rnames)).map((id) => new ObjectID(id)),
            },
        }).toArray();
        for (const rdoc of rdocs) {
            zip.addFile(`${rnames[rdoc._id.toHexString()]}.${rdoc.lang}`, Buffer.from(rdoc.code));
        }
        this.binary(zip.toBuffer(), `${tdoc.title}.zip`);
    }
}

class ContestCreateHandler extends Handler {
    async get() {
        this.response.template = 'contest_edit.html';
        const rules = {};
        for (const i in contest.RULES) { rules[i] = contest.RULES[i].TEXT; }
        const now = new Date();
        let ts = now.getTime();
        ts = ts - (ts % (15 * 60 * 1000)) + 15 * 60 * 1000;
        const dt = new Date(ts);
        const path = [
            ['Hydro', 'homepage'],
            ['contest_main', 'contest_main'],
            ['contest_create', null],
        ];
        this.response.body = {
            rules,
            path,
            page_name: 'contest_create',
            date_text: dt.format('%Y-%m-%d'),
            time_text: dt.format('%H:%M'),
            pids: '1000, 1001',
        };
    }

    @param('beginAtDate', Types.Date)
    @param('beginAtTime', Types.Time)
    @param('duration', Types.Float)
    @param('title', Types.Title)
    @param('content', Types.Content)
    @param('rule', Types.Name)
    @param('pids', Types.Content)
    @param('rated', Types.Boolean)
    async post(
        domainId: string, beginAtDate: string, beginAtTime: string, duration: number,
        title: string, content: string, rule: string, _pids: string, rated = false,
    ) {
        const pids = _pids.replace(/，/g, ',').split(',').map((i) => +i).filter((i) => i);
        const beginAt = moment.tz(`${beginAtDate} ${beginAtTime}`, this.user.timeZone);
        if (!beginAt.isValid()) throw new ValidationError('beginAtDate', 'beginAtTime');
        const endAt = beginAt.clone().add(duration, 'hours').toDate();
        await problem.getList(domainId, pids, this.user.hasPerm(PERM.PERM_VIEW_PROBLEM_HIDDEN), true);
        const tid = await contest.add(
            domainId, title, content,
            this.user._id, rule, beginAt.toDate(), endAt, pids, rated,
        );
        this.response.body = { tid };
        this.response.redirect = this.url('contest_detail', { tid });
    }
}

export async function apply() {
    Route('contest_create', '/contest/create', ContestCreateHandler, PERM.PERM_CREATE_CONTEST);
    Route('contest_main', '/contest', ContestListHandler, PERM.PERM_VIEW_CONTEST);
    Route('contest_detail', '/contest/:tid', ContestDetailHandler, PERM.PERM_VIEW_CONTEST);
    Route('contest_boardcast', '/contest/:tid/boardcast', ContestBoardcastHandler);
    Route('contest_edit', '/contest/:tid/edit', ContestEditHandler, PERM.PERM_VIEW_CONTEST);
    Route('contest_scoreboard', '/contest/:tid/scoreboard', ContestScoreboardHandler, PERM.PERM_VIEW_CONTEST);
    Route('contest_scoreboard_download', '/contest/:tid/export/:ext', ContestScoreboardDownloadHandler, PERM.PERM_VIEW_CONTEST);
    Route('contest_detail_problem', '/contest/:tid/p/:pid', ContestProblemHandler, PERM.PERM_VIEW_CONTEST);
    Route('contest_detail_problem_file_download', '/contest/:tid/p/:pid/file/:filename', ContestProblemFileDownloadHandler, PERM.PERM_VIEW_PROBLEM);
    Route('contest_detail_problem_submit', '/contest/:tid/p/:pid/submit', ContestDetailProblemSubmitHandler, PERM.PERM_VIEW_CONTEST);
    Route('contest_code', '/contest/:tid/code', ContestCodeHandler, PERM.PERM_VIEW_CONTEST);
}

global.Hydro.handler.contest = apply;
