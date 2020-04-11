const
    { ContestNotLiveError, ValidationError, ProblemNotFoundError } = require('../error'),
    { PERM_VIEW_CONTEST_HIDDEN_SCOREBOARD, PERM_CREATE_CONTEST } = require('../permission'),
    { constants } = require('../options'),
    paginate = require('../lib/paginate'),
    contest = require('../model/contest'),
    problem = require('../model/problem'),
    record = require('../model/record'),
    user = require('../model/user'),
    { Route, Handler } = require('../service/server');


class ContestHandler extends Handler {
    canViewHiddenScoreboard() {
        return this.hasPerm(PERM_VIEW_CONTEST_HIDDEN_SCOREBOARD);
    }
    canShowRecord(tdoc, allowPermOverride = true) {
        if (contest.RULES[tdoc.rule].showRecordFunc(tdoc, new Date())) return true;
        if (allowPermOverride && this.canViewHiddenScoreboard(tdoc)) return true;
        return false;
    }
    canShowScoreboard(tdoc, allowPermOverride = true) {
        if (contest.RULES[tdoc.rule].showScoreboardFunc(tdoc, new Date())) return true;
        if (allowPermOverride && this.canViewHiddenScoreboard(tdoc)) return true;
        return false;
    }
    async verifyProblems(pids) {
        let pdocs = await problem.getMulti({ _id: { $in: pids } }).sort({ doc_id: 1 }).toArray();
        if (pids.length != pdocs.length)
            for (let pid of pids) {
                let p = false;
                for (let pdoc of pdocs)
                    if (pid == pdoc._id) {
                        p = true;
                        break;
                    }
                if (!p) throw new ProblemNotFoundError(pid);
            }
        return pids;
    }
}
class ContestListHandler extends ContestHandler {
    async get({ rule = 0, page = 1 }) {
        this.response.template = 'contest_main.html';
        let tdocs, qs, tpcount;
        if (!rule) {
            tdocs = contest.getMulti();
            qs = '';
        } else {
            if (!contest.CONTEST_RULES.includes(rule)) throw new ValidationError('rule');
            tdocs = contest.getMulti({ rule });
            qs = 'rule={0}'.format(rule);
        }
        [tdocs, tpcount] = await paginate(tdocs, page, constants.CONTEST_PER_PAGE);
        let tids = [];
        for (let tdoc of tdocs) tids.push(tdoc._id);
        let tsdict = await contest.getListStatus(this.uid, tids);
        this.response.body = {
            page, tpcount, qs, rule, tdocs, tsdict
        };
    }
}
class ContestDetailHandler extends ContestHandler {
    async _prepare({ tid }) {
        this.tdoc = await contest.get(tid);
    }
    async get({ page = 1 }) {
        this.response.template = 'contest_detail.html';
        let [tsdoc, pdict] = await Promise.all([
            contest.getStatus(this.tdoc._id, this.uid),
            problem.getList(this.tdoc.pids)
        ]);
        let psdict = {}, rdict = {}, attended;
        if (tsdoc) {
            attended = tsdoc.attend == 1;
            for (let pdetail in tsdoc.detail || [])
                psdict[pdetail['pid']] = pdetail;
            if (this.canShowRecord(this.tdoc)) {
                let q = [];
                for (let i in psdict) q.push(psdict[i].rid);
                rdict = await record.getList(q, { getHidden: true });
            } else
                for (let i in psdict)
                    rdict[psdict[i].rid] = { _id: psdict[i].rid };
        } else attended = false;
        let udict = await user.get_dict([this.tdoc.owner]);
        let path = [
            ['contest_main', '/c'],
            [this.tdoc['title'], null, true]
        ];
        this.response.body = {
            path, tdoc: this.tdoc, tsdoc, attended, udict, pdict, psdict, rdict, page
        };
    }
    async post_attend() {
        if (contest.isDone(this.tdoc)) throw new ContestNotLiveError(this.tdoc._id);
        await contest.attend(this.tdoc._id, this.uid);
        this.back();
    }
}
class ContestProblemHandler extends ContestDetailHandler {
    constructor(ctx) {
        super(ctx);
        this.response.template = '';
    }
}
class ContestCreateHandler extends ContestHandler {
    async prepare() {
        this.checkPerm(PERM_CREATE_CONTEST);
    }
    async get() {
        this.response.template = 'contest_edit.html';
        let rules = {};
        for (let i in contest.RULES)
            rules[i] = contest.RULES[i].TEXT;
        let now = new Date();
        let ts = now.getTime();
        ts = ts - ts % (15 * 60 * 1000) + 15 * 60 * 1000;
        let dt = new Date(ts);
        this.response.body = {
            rules, page_name: 'contest_create',
            date_text: `${dt.getFullYear()}-${dt.getMonth()}-${dt.getDate()}`,
            time_text: `${dt.getHours()}-${dt.getMinutes()}`,
            pids: '1000, 1001'
        };
    }
    async post({ title, content, rule, beginAtDate, beginAtTime, duration, pids }) {
        let beginAt, endAt;
        try {
            beginAt = Date.parse(`${beginAtDate}T${beginAtTime}+8:00`);
        } catch (e) {
            throw new ValidationError('beginAtDate', 'beginAtTime');
        }
        endAt = new Date(beginAt + duration * 3600 * 1000);
        if (beginAt >= endAt) throw new ValidationError('duration');
        await this.verifyProblems(pids);
        let tid = await contest.add(title, content, this.user._id, rule, beginAt, endAt, pids);
        this.response.body = { tid };
        this.response.redirect = `/c/${tid}`;
    }
}

Route('/c', ContestListHandler);
Route('/c/:cid', ContestDetailHandler);
Route('/c/:cid/p/:pid', ContestProblemHandler);
Route('/contest/create', ContestCreateHandler);
