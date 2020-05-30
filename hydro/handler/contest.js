const {
    ContestNotLiveError, ValidationError, ProblemNotFoundError,
    ContestNotAttendedError,
} = require('../error');
const { PERM_CREATE_CONTEST, PERM_EDIT_CONTEST } = require('../permission');
const paginate = require('../lib/paginate');
const contest = require('../model/contest');
const problem = require('../model/problem');
const record = require('../model/record');
const user = require('../model/user');
const system = require('../model/system');
const { Route, Handler } = require('../service/server');

const ContestHandler = contest.ContestHandlerMixin(Handler);

class ContestListHandler extends ContestHandler {
    async get({ domainId, rule = 0, page = 1 }) {
        this.response.template = 'contest_main.html';
        let tdocs;
        let qs;
        let tpcount;
        if (!rule) {
            tdocs = contest.getMulti(domainId).sort({ beginAt: -1 });
            qs = '';
        } else {
            if (!contest.CONTEST_RULES.includes(rule)) throw new ValidationError('rule');
            tdocs = contest.getMulti(domainId, { rule }).sort({ beginAt: -1 });
            qs = 'rule={0}'.format(rule);
        }
        // eslint-disable-next-line prefer-const
        [tdocs, tpcount] = await paginate(tdocs, page, await system.get('CONTEST_PER_PAGE'));
        const tids = [];
        for (const tdoc of tdocs) tids.push(tdoc.docId);
        const tsdict = await contest.getListStatus(domainId, this.user._id, tids);
        const path = [
            ['Hydro', '/'],
            ['contest_main', null],
        ];
        this.response.body = {
            page, tpcount, qs, rule, tdocs, tsdict, path,
        };
    }
}

class ContestDetailHandler extends ContestHandler {
    async _prepare({ domainId, tid }) {
        this.tdoc = await contest.get(domainId, tid);
    }

    async get({ domainId, page = 1 }) {
        this.response.template = 'contest_detail.html';
        const [tsdoc, pdict] = await Promise.all([
            contest.getStatus(domainId, this.tdoc.docId, this.user._id),
            problem.getList(domainId, this.tdoc.pids),
        ]);
        const psdict = {};
        let rdict = {};
        let attended;
        if (tsdoc) {
            attended = tsdoc.attend === 1;
            for (const pdetail of tsdoc.journal || []) psdict[pdetail.pid] = pdetail;
            if (this.canShowRecord(this.tdoc)) {
                const q = [];
                for (const i in psdict) q.push(psdict[i].rid);
                rdict = await record.getList(domainId, q);
            } else {
                for (const i in psdict) rdict[psdict[i].rid] = { _id: psdict[i].rid };
            }
        } else attended = false;
        const udict = await user.getList(domainId, [this.tdoc.owner]);
        const path = [
            ['Hydro', '/'],
            ['contest_main', '/c'],
            [this.tdoc.title, null, true],
        ];
        this.response.body = {
            path, tdoc: this.tdoc, tsdoc, attended, udict, pdict, psdict, rdict, page,
        };
    }

    async postAttend({ domainId }) {
        if (contest.isDone(this.tdoc)) throw new ContestNotLiveError(this.tdoc.docId);
        await contest.attend(domainId, this.tdoc.docId, this.user._id);
        this.back();
    }
}

class ContestScoreboardHandler extends ContestDetailHandler {
    async get({ domainId, tid }) {
        const [tdoc, rows, udict] = await this.getScoreboard(domainId, tid);
        const path = [
            ['Hydro', '/'],
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

class ContestScoreboardDownloadHandler extends ContestDetailHandler {
    async get({ domainId, tid, ext }) {
        const getContent = {
            csv: async (rows) => `\uFEFF${rows.map((c) => (c.map((i) => i.value).join(','))).join('\n')}`,
            html: (rows) => this.renderHTML('contest_scoreboard_download_html.html', { rows }),
        };
        if (!getContent[ext]) throw new ValidationError('ext');
        const [, rows] = await this.getScoreboard(domainId, tid, true);
        this.binary(await getContent[ext](rows), `${this.tdoc.title}.${ext}`);
    }
}

class ContestEditHandler extends ContestDetailHandler {
    async prepare() {
        if (this.tdoc.owner !== this.user._id) this.checkPerm(PERM_EDIT_CONTEST);
    }

    async get() {
        this.response.template = 'contest_edit.html';
        const rules = {};
        for (const i in contest.RULES) {
            rules[i] = contest.RULES[i].TEXT;
        }
        const duration = (this.tdoc.endAt.getTime() - this.tdoc.beginAt.getTime()) / 3600 / 1000;
        const path = [
            ['Hydro', '/'],
            ['contest_main', '/c'],
            [this.tdoc.title, `/c/${this.tdoc.docId}`, true],
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
        domainId, beginAtDate, beginAtTime, duration, title, content, rule, pids,
    }) {
        let beginAt;
        try {
            beginAt = new Date(Date.parse(`${beginAtDate} ${beginAtTime.replace('-', ':')}`));
        } catch (e) {
            throw new ValidationError('beginAtDate', 'beginAtTime');
        }
        const endAt = new Date(beginAt + duration * 3600 * 1000);
        if (beginAt >= endAt) throw new ValidationError('duration');
        pids = await this.verifyProblems(domainId, pids);
        await contest.edit(domainId, this.tdoc.docId, title, content, rule, beginAt, endAt, pids);
        if (this.tdoc.beginAt !== beginAt || this.tdoc.endAt !== endAt
            || Array.isDiff(this.tdoc.pids, pids) || this.tdoc.rule !== rule) {
            await contest.recalcStatus(this.tdoc.docId);
        }
        if (this.preferJson) this.response.body = { tid: this.tdoc.docId };
        else this.response.redirect = `/c/${this.tdoc.docId}`;
    }
}

class ContestProblemHandler extends ContestDetailHandler {
    async prepare({ domainId, tid, pid }) {
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
        if (contest.isDone(this.tdoc)) {
            if (!this.attended) throw new ContestNotAttendedError(this.tdoc.docId);
            if (!contest.isOngoing(this.tdoc)) throw new ContestNotLiveError(this.tdoc.docId);
        }
        if (!this.tdoc.pids.map((s) => s.toString()).includes(this.pdoc.docId.toString())) {
            throw new ProblemNotFoundError(pid, this.tdoc.docId);
        }
    }

    async get({ tid }) {
        const path = [
            ['Hydro', '/'],
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
    async get({ domainId, tid, pid }) {
        let rdocs = [];
        if (this.canShowRecord(this.tdoc)) {
            rdocs = await record.getUserInProblemMulti(domainId, this.user._id, this.pdoc.docId, true)
                .sort({ _id: -1 }).limit(10).toArray();
        }
        this.response.template = 'problem_submit.html';
        const path = [
            ['Hydro', '/'],
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

    async post({
        domainId, tid, lang, code,
    }) {
        await this.limitRate('add_record', 60, 100);
        const rid = await record.add(domainId, {
            pid: this.pdoc.docId,
            uid: this.user._id,
            tid: this.tdoc.docId,
            lang,
            code,
            hidden: true,
        });
        await Promise.all([
            record.judge(domainId, rid),
            contest.updateStatus(domainId, this.tdoc.docId, this.user._id, rid, this.pdoc.docId),
        ]);
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
        const path = [
            ['Hydro', '/'],
            ['contest_main', '/c'],
            ['contest_create', null],
        ];
        this.response.body = {
            rules,
            path,
            page_name: 'contest_create',
            date_text: `${dt.getFullYear()}-${dt.getMonth() + 1}-${dt.getDate()}`,
            time_text: `${dt.getHours()}:${dt.getMinutes()}`,
            pids: '1000, 1001',
        };
    }

    async post({
        domainId, title, content, rule, beginAtDate, beginAtTime, duration, pids,
    }) {
        let beginAt;
        try {
            beginAt = new Date(Date.parse(`${beginAtDate} ${beginAtTime.replace('-', ':')}`));
        } catch (e) {
            throw new ValidationError('beginAtDate', 'beginAtTime');
        }
        const endAt = new Date(beginAt.getTime() + duration * 3600 * 1000);
        if (beginAt >= endAt) throw new ValidationError('duration');
        pids = await this.verifyProblems(domainId, pids);
        const tid = await contest.add(domainId, title, content, this.user._id, rule, beginAt, endAt, pids);
        this.response.body = { tid };
        this.response.redirect = `/c/${tid}`;
    }
}

async function apply() {
    Route('/c', module.exports.ContestListHandler);
    Route('/c/:tid', module.exports.ContestDetailHandler);
    Route('/c/:tid/edit', module.exports.ContestEditHandler);
    Route('/c/:tid/scoreboard', module.exports.ContestScoreboardHandler);
    Route('/c/:tid/export/:ext', module.exports.ContestScoreboardDownloadHandler);
    Route('/c/:tid/p/:pid', module.exports.ContestProblemHandler);
    Route('/c/:tid/p/:pid/submit', module.exports.ContestProblemSubmitHandler);
    Route('/contest/create', module.exports.ContestCreateHandler);
}

global.Hydro.handler.contest = module.exports = {
    ContestListHandler,
    ContestDetailHandler,
    ContestEditHandler,
    ContestScoreboardHandler,
    ContestScoreboardDownloadHandler,
    ContestProblemHandler,
    ContestProblemSubmitHandler,
    ContestCreateHandler,
    apply,
};
