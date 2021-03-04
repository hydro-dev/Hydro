import moment from 'moment-timezone';
import { ObjectID } from 'mongodb';
import AdmZip from 'adm-zip';
import { isSafeInteger } from 'lodash';
import {
    ContestNotLiveError, ValidationError, ProblemNotFoundError,
    ContestNotAttendedError, PermissionError,
} from '../error';
import { isContent, isTitle } from '../lib/validator';
import paginate from '../lib/paginate';
import { PERM, PRIV } from '../model/builtin';
import * as contest from '../model/contest';
import * as system from '../model/system';
import * as document from '../model/document';
import * as problem from '../model/problem';
import * as domain from '../model/domain';
import * as record from '../model/record';
import * as user from '../model/user';
import * as message from '../model/message';
import {
    Route, Handler, Types, param,
} from '../service/server';
import * as bus from '../service/bus';

const ContestHandler = contest.ContestHandlerMixin(Handler);

class ContestListHandler extends ContestHandler {
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

class ContestDetailHandler extends ContestHandler {
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
            if (this.canShowRecord(tdoc)) {
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
}

class ContestBoardcastHandler extends ContestHandler {
    @param('tid', Types.ObjectID)
    async get(domainId: string, tid: ObjectID) {
        const tdoc = await contest.get(domainId, tid);
        if (tdoc.owner !== this.user._id) throw new PermissionError('Boardcast Message');
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
    @param('content', Types.String, isContent)
    async post(domainId: string, tid: ObjectID, content: string) {
        const tdoc = await contest.get(domainId, tid);
        if (tdoc.owner !== this.user._id) throw new PermissionError('Boardcast Message');
        const tsdocs = await contest.getMultiStatus(domainId, { docId: tid }).toArray();
        const uids: number[] = Array.from(new Set(tsdocs.map((tsdoc) => tsdoc.uid)));
        await Promise.all(
            uids.map((uid) => message.send(this.user._id, uid, content, message.FLAG_ALERT)),
        );
        this.response.redirect = this.url('contest_detail', { tid });
    }
}

class ContestScoreboardHandler extends ContestHandler {
    @param('tid', Types.ObjectID)
    async get(domainId: string, tid: ObjectID) {
        const [tdoc, rows, udict] = await this.getScoreboard(domainId, tid);
        const path = [
            ['Hydro', 'homepage'],
            ['contest_main', 'contest_main'],
            [tdoc.title, 'contest_detail', { tid }, true],
            ['contest_scoreboard', null],
        ];
        this.response.template = 'contest_scoreboard.html';
        this.response.body = {
            tdoc, rows, path, udict,
        };
    }
}

class ContestScoreboardRawHandler extends ContestHandler {
    @param('tid', Types.ObjectID)
    async get(domainId: string, tid: ObjectID) {
        this.response.body = await this.getRawStatus(domainId, tid);
    }
}

class ContestScoreboardDownloadHandler extends ContestHandler {
    @param('tid', Types.ObjectID)
    @param('ext', Types.String)
    async get(domainId: string, tid: ObjectID, ext: string) {
        const getContent = {
            csv: async (rows) => `\uFEFF${rows.map((c) => (c.map((i) => i.value).join(','))).join('\n')}`,
            html: (rows) => this.renderHTML('contest_scoreboard_download_html.html', { rows }),
        };
        if (!getContent[ext]) throw new ValidationError('ext');
        const [tdoc, rows] = await this.getScoreboard(domainId, tid, true);
        this.binary(await getContent[ext](rows), `${tdoc.title}.${ext}`);
    }
}

class ContestEditHandler extends ContestHandler {
    @param('tid', Types.ObjectID)
    async prepare(domainId: string, tid: ObjectID) {
        this.tdoc = await contest.get(domainId, tid);
        if (this.tdoc.owner !== this.user._id) this.checkPerm(PERM.PERM_EDIT_CONTEST);
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
    @param('title', Types.String, isTitle)
    @param('content', Types.String, isContent)
    @param('rule', Types.Range(contest.RULES))
    @param('pids', Types.String)
    @param('rated', Types.Boolean)
    async post(
        domainId: string, beginAtDate: string, beginAtTime: string, duration: number,
        title: string, content: string, rule: string, _pids: string, rated = false,
    ) {
        let pids = _pids.split(',').map((i) => {
            if (isSafeInteger(parseInt(i, 10))) return parseInt(i, 10);
            return i;
        });
        const beginAtMoment = moment.tz(`${beginAtDate} ${beginAtTime}`, this.user.timeZone);
        if (!beginAtMoment.isValid()) {
            throw new ValidationError('beginAtDate', 'beginAtTime');
        }
        const endAt = beginAtMoment.clone().add(duration, 'hours').toDate();
        if (beginAtMoment.isSameOrAfter(endAt)) throw new ValidationError('duration');
        const beginAt = beginAtMoment.toDate();
        pids = await this.verifyProblems(domainId, pids);
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

class ContestProblemHandler extends ContestHandler {
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
            throw new ProblemNotFoundError(pid, this.tdoc.docId);
        }
    }

    async get() {
        const path = [
            ['Hydro', 'homepage'],
            ['contest_main', 'contest_main'],
            [this.tdoc.title, 'contest_detail', { tid: this.tdoc.docId }, true],
            [this.pdoc.title, null, null, true],
        ];
        this.response.body = {
            tdoc: this.tdoc,
            pdoc: this.pdoc,
            tsdoc: this.tsdoc,
            udoc: this.udoc,
            attended: this.attended,
            path,
            page_name: 'contest_detail_problem',
        };
    }
}

class ContestDetailProblemSubmitHandler extends ContestProblemHandler {
    @param('tid', Types.ObjectID)
    @param('pid', Types.UnsignedInt)
    async prepare(domainId: string, tid: ObjectID, pid: number) {
        if (!contest.isOngoing(this.tdoc)) throw new ContestNotLiveError(this.tdoc.docId);
        let rdocs = [];
        if (this.canShowRecord(this.tdoc)) {
            rdocs = await record.getUserInProblemMulti(
                domainId, this.user._id,
                this.pdoc.docId, true,
            ).sort({ _id: -1 }).limit(10).toArray();
        }
        this.response.template = 'problem_submit.html';
        const path = [
            ['Hydro', 'homepage'],
            ['contest_main', 'contest_main'],
            [this.tdoc.title, 'contest_detail', { tid }, true],
            [this.pdoc.title, 'contest_detail_problem', { tid, pid }, true],
            ['contest_detail_problem_submit', null],
        ];
        this.response.body = {
            tdoc: this.tdoc,
            pdoc: this.pdoc,
            udoc: this.udoc,
            attended: this.attend,
            path,
            rdocs,
            page_name: 'contest_detail_problem_submit',
        };
    }

    @param('tid', Types.ObjectID)
    @param('lang', Types.String)
    @param('code', Types.String)
    async post(domainId: string, tid: ObjectID, lang: string, code: string) {
        await this.limitRate('add_record', 60, 100);
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
        if (!this.canShowRecord(this.tdoc)) {
            this.response.body = { tid };
            this.response.redirect = this.url('contest_detail', { tid });
        } else {
            this.response.body = { rid };
            this.response.redirect = this.url('record_detail', { rid });
        }
    }
}

class ContestCodeHandler extends ContestHandler {
    @param('tid', Types.ObjectID)
    async get(domainId: string, tid: ObjectID) {
        if (!this.user.hasPriv(PRIV.PRIV_READ_RECORD_CODE)) {
            this.checkPerm(PERM.PERM_READ_RECORD_CODE);
        }
        this.limitRate('homework_code', 3600, 60);
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
        await this.binary(zip.toBuffer(), `${tdoc.title}.zip`);
    }
}

class ContestCreateHandler extends ContestHandler {
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
    @param('title', Types.String, isTitle)
    @param('content', Types.String, isContent)
    @param('rule', Types.String)
    @param('pids', Types.String)
    @param('rated', Types.Boolean)
    async post(
        domainId: string, beginAtDate: string, beginAtTime: string, duration: number,
        title: string, content: string, rule: string, _pids: string, rated = false,
    ) {
        let pids = _pids.split(',').map((i) => {
            if (isSafeInteger(parseInt(i, 10))) return parseInt(i, 10);
            return i;
        });
        const beginAt = moment.tz(`${beginAtDate} ${beginAtTime}`, this.user.timeZone);
        if (!beginAt.isValid()) {
            throw new ValidationError('beginAtDate', 'beginAtTime');
        }
        const endAt = beginAt.clone().add(duration, 'hours');
        pids = await this.verifyProblems(domainId, pids);
        const tid = await contest.add(
            domainId, title, content,
            this.user._id, rule, beginAt.toDate(), endAt.toDate(), pids, rated,
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
    Route('contest_scoreboard_raw', '/contest/:tid/scoreboard/raw', ContestScoreboardRawHandler, PERM.PERM_VIEW_CONTEST);
    Route('contest_scoreboard_download', '/contest/:tid/export/:ext', ContestScoreboardDownloadHandler, PERM.PERM_VIEW_CONTEST);
    Route('contest_detail_problem', '/contest/:tid/p/:pid', ContestProblemHandler, PERM.PERM_VIEW_CONTEST);
    Route('contest_detail_problem_submit', '/contest/:tid/p/:pid/submit', ContestDetailProblemSubmitHandler, PERM.PERM_VIEW_CONTEST);
    Route('contest_code', '/contest/:tid/code', ContestCodeHandler, PERM.PERM_VIEW_CONTEST);
}

global.Hydro.handler.contest = apply;
