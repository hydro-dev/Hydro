const {
    ContestNotLiveError, ValidationError, ProblemNotFoundError,
    ContestNotAttendedError,
} = require('../error');
const { PERM_CREATE_CONTEST, PERM_EDIT_CONTEST } = require('../permission');
const { constants } = require('../options');
const paginate = require('../lib/paginate');
const contest = require('../model/contest');
const problem = require('../model/problem');
const record = require('../model/record');
const user = require('../model/user');
const { Route, Handler } = require('../service/server');

const ContestHandler = contest.ContestHandlerMixin(Handler);
class ContestListHandler extends ContestHandler {
    async get({ rule = 0, page = 1 }) {
        this.response.template = 'contest_main.html';
        let tdocs;
        let qs;
        let tpcount;
        if (!rule) {
            tdocs = contest.getMulti().sort({ beginAt: -1 });
            qs = '';
        } else {
            if (!contest.CONTEST_RULES.includes(rule)) throw new ValidationError('rule');
            tdocs = contest.getMulti({ rule }).sort({ beginAt: -1 });
            qs = 'rule={0}'.format(rule);
        }
        // eslint-disable-next-line prefer-const
        [tdocs, tpcount] = await paginate(tdocs, page, constants.CONTEST_PER_PAGE);
        const tids = [];
        for (const tdoc of tdocs) tids.push(tdoc._id);
        const tsdict = await contest.getListStatus(this.user._id, tids);
        this.response.body = {
            page, tpcount, qs, rule, tdocs, tsdict,
        };
    }
}
class ContestDetailHandler extends ContestHandler {
    async _prepare({ tid }) {
        this.tdoc = await contest.get(tid);
    }

    async get({ page = 1 }) {
        this.response.template = 'contest_detail.html';
        const [tsdoc, pdict] = await Promise.all([
            contest.getStatus(this.tdoc._id, this.user._id),
            problem.getList(this.tdoc.pids),
        ]);
        const psdict = {}; let rdict = {}; let
            attended;
        if (tsdoc) {
            attended = tsdoc.attend === 1;
            for (const pdetail of tsdoc.journal || []) { psdict[pdetail.pid] = pdetail; }
            if (this.canShowRecord(this.tdoc)) {
                const q = [];
                for (const i in psdict) q.push(psdict[i].rid);
                rdict = await record.getList(q);
            } else { for (const i in psdict) rdict[psdict[i].rid] = { _id: psdict[i].rid }; }
        } else attended = false;
        const udict = await user.getList([this.tdoc.owner]);
        const path = [
            ['contest_main', '/c'],
            [this.tdoc.title, null, true],
        ];
        this.response.body = {
            path, tdoc: this.tdoc, tsdoc, attended, udict, pdict, psdict, rdict, page,
        };
    }

    async postAttend() {
        if (contest.is_done(this.tdoc)) throw new ContestNotLiveError(this.tdoc._id);
        await contest.attend(this.tdoc._id, this.user._id);
        this.back();
    }
}
class ContestScoreboardHandler extends ContestDetailHandler {
    async get({ tid }) {
        const [tdoc, rows, udict] = await this.getScoreboard(tid);
        const path = [
            ['contest_main', '/c'],
            [tdoc.title, `/c/${tid}`, true],
            ['contest_scoreboard', null],
        ];
        this.response.template = 'contest_scoreboard.html';
        this.response.body = {
            tdoc, rows, path, udict,
        };
    }
}
class ContestEditHandler extends ContestDetailHandler {
    async prepare({ tid }) {
        const tdoc = await contest.get(tid);
        if (!tdoc.owner !== this.user._id) this.checkPerm(PERM_EDIT_CONTEST);
    }

    async get() {
        this.response.template = 'contest_edit.html';
        const rules = {};
        for (const i in contest.RULES) { rules[i] = contest.RULES[i].TEXT; }
        const duration = (this.tdoc.endAt.getTime() - this.tdoc.beginAt.getTime()) / 3600 / 1000;
        const path = [
            ['contest_main', '/c'],
            [this.tdoc.title, `/c/${this.tdoc._id}`, true],
            ['contest_edit', null],
        ];
        const dt = this.tdoc.beginAt;
        this.response.body = {
            rules,
            tdoc: this.tdoc,
            duration,
            path,
            pids: this.tdoc.pids.join(','),
            date_text: `${dt.getFullYear()}-${dt.getMonth() + 1}-${dt.getDate()}`,
            time_text: `${dt.getHours()}:${dt.getMinutes()}`,
            page_name: 'contest_edit',
        };
    }

    async post({
        beginAtDate, beginAtTime, duration, title, content, rule, pids,
    }) {
        let beginAt;
        try {
            beginAt = new Date(Date.parse(`${beginAtDate} ${beginAtTime.replace('-', ':')}`));
        } catch (e) {
            throw new ValidationError('beginAtDate', 'beginAtTime');
        }
        const endAt = new Date(beginAt + duration * 3600 * 1000);
        if (beginAt >= endAt) throw new ValidationError('duration');
        pids = await this.verifyProblems(pids);
        await contest.edit(this.tdoc._id, title, content, rule, beginAt, endAt, pids);
        if (this.tdoc.beginAt !== beginAt || this.tdoc.endAt !== endAt
            || Array.isDiff(this.tdoc.pids, pids) || this.tdoc.rule !== rule) {
            await contest.recalcStatus(this.tdoc._id);
        }
        if (this.preferJson) this.response.body = { tid: this.tdoc._id };
        else this.response.redirect = `/c/${this.tdoc._id}`;
    }
}
class ContestProblemHandler extends ContestDetailHandler {
    async prepare({ tid, pid }) {
        [this.tdoc, this.pdoc] = await Promise.all([
            contest.get(tid),
            problem.get(pid, this.user._id),
        ]);
        [this.tsdoc, this.udoc] = await Promise.all([
            contest.getStatus(this.tdoc._id, this.user._id),
            user.getById(this.tdoc.owner),
        ]);
        this.attended = this.tsdoc && this.tsdoc.attend === 1;
        this.response.template = 'problem_detail.html';
        if (contest.is_done(this.tdoc)) {
            if (!this.attended) throw new ContestNotAttendedError(this.tdoc._id);
            if (!contest.is_ongoing(this.tdoc)) throw new ContestNotLiveError(this.tdoc._id);
        }
        console.log(this.tdoc.pids, this.pdoc._id);
        if (!this.tdoc.pids.map((s) => s.toString()).includes(this.pdoc._id.toString())) {
            throw new ProblemNotFoundError(pid, this.tdoc._id);
        }
    }

    async get({ tid }) {
        const path = [
            ['contest_main', '/c'],
            [this.tdoc.title, `/c/${tid}`, true],
            [this.pdoc.title, null, true],
        ];
        this.response.body = {
            tdoc: this.tdoc,
            pdoc: this.pdoc,
            tsdoc: this.tsdoc,
            udoc: this.udoc,
            attended: this.attended,
            path,
        };
    }
}
class ContestProblemSubmitHandler extends ContestProblemHandler {
    async get({ tid, pid }) {
        let rdocs = [];
        if (this.canShowRecord(this.tdoc)) {
            rdocs = await record.getUserInProblemMulti(this.user._id, this.pdoc._id, true)
                .sort({ _id: -1 }).limit(10).toArray();
        }
        this.response.template = 'problem_submit.html';
        const path = [
            ['contest_main', '/c'],
            [this.tdoc.title, `/c/${tid}`, true],
            [this.pdoc.title, `/c/${tid}/p/${pid}`, true],
            ['contest_detail_problem_submit', null],
        ];
        this.response.body = {
            tdoc: this.tdoc,
            pdoc: this.pdoc,
            tsdoc: this.tsdoc,
            udoc: this.udoc,
            attended: this.attend,
            path,
            rdocs,
        };
    }

    async post({ tid, lang, code }) {
        await this.limitRate('add_record', 60, 100);
        const rid = await record.add({
            pid: this.pdoc._id, uid: this.user._id, lang, code, tid: this.tdoc._id, hidden: true,
        });
        await contest.updateStatus(this.tdoc._id, this.user._id, rid, this.pdoc._id, false, 0);
        if (!this.canShowRecord(this.tdoc)) {
            this.response.body = { tid };
            this.response.redirect = `/c/${tid}`;
        } else {
            this.response.body = { rid };
            this.response.redirect = `/r/${rid}`;
        }
    }
}
class ContestCreateHandler extends ContestHandler {
    async prepare() {
        this.checkPerm(PERM_CREATE_CONTEST);
    }

    async get() {
        this.response.template = 'contest_edit.html';
        const rules = {};
        for (const i in contest.RULES) { rules[i] = contest.RULES[i].TEXT; }
        const now = new Date();
        let ts = now.getTime();
        ts = ts - (ts % (15 * 60 * 1000)) + 15 * 60 * 1000;
        const dt = new Date(ts);
        this.response.body = {
            rules,
            page_name: 'contest_create',
            date_text: `${dt.getFullYear()}-${dt.getMonth() + 1}-${dt.getDate()}`,
            time_text: `${dt.getHours()}:${dt.getMinutes()}`,
            pids: '1000, 1001',
        };
    }

    async post({
        title, content, rule, beginAtDate, beginAtTime, duration, pids,
    }) {
        let beginAt;
        try {
            beginAt = new Date(Date.parse(`${beginAtDate} ${beginAtTime.replace('-', ':')}`));
        } catch (e) {
            throw new ValidationError('beginAtDate', 'beginAtTime');
        }
        const endAt = new Date(beginAt.getTime() + duration * 3600 * 1000);
        if (beginAt >= endAt) throw new ValidationError('duration');
        pids = await this.verifyProblems(pids);
        const tid = await contest.add(title, content, this.user._id, rule, beginAt, endAt, pids);
        this.response.body = { tid };
        this.response.redirect = `/c/${tid}`;
    }
}

Route('/c', ContestListHandler);
Route('/c/:tid', ContestDetailHandler);
Route('/c/:tid/edit', ContestEditHandler);
Route('/c/:tid/scoreboard', ContestScoreboardHandler);
Route('/c/:tid/p/:pid', ContestProblemHandler);
Route('/c/:tid/p/:pid/submit', ContestProblemSubmitHandler);
Route('/contest/create', ContestCreateHandler);
