const user = require('./user');
const problem = require('./problem');
const {
    ValidationError, ContestNotFoundError, ContestAlreadyAttendedError,
    ContestNotAttendedError, ProblemNotFoundError, ContestScoreboardHiddenError,
} = require('../error');
const { PERM_VIEW_CONTEST_HIDDEN_SCOREBOARD } = require('../permission');
const validator = require('../lib/validator');
const ranked = require('../lib/rank');
const document = require('./document');

const acm = {
    TEXT: 'ACM/ICPC',
    check: () => { },
    showScoreboard: () => true,
    showRecord: (tdoc, now) => now > tdoc.endAt,
    stat: (tdoc, journal) => {
        const naccept = {};
        const effective = {};
        const detail = [];
        let accept = 0;
        let time = 0;
        for (const j in journal) {
            if (tdoc.pids.includes(j.pid)
                && !(effective.includes(j.pid) && effective[j.pid].accept)) {
                effective[j.pid] = j;
            }
            if (!j.accept) naccept[j.pid]++;
        }
        function _time(jdoc) {
            const real = jdoc.rid.generationTime - Math.floor(tdoc.begin_at / 1000);
            const penalty = 20 * 60 * naccept[jdoc.pid];
            return real + penalty;
        }
        for (const j of effective) detail.push({ ...j, naccept: naccept[j.pid], time: _time(j) });
        for (const d of detail) {
            accept += d.accept;
            if (d.accept) time += d.time;
        }
        return { accept, time, detail };
    },
    scoreboard(isExport, _, tdoc, rankedTsdocs, udict, pdict) {
        const columns = [
            { type: 'rank', value: _('Rank') },
            { type: 'user', value: _('User') },
            { type: 'solved_problems', value: _('Solved Problems') },
        ];
        if (isExport) {
            columns.push({ type: 'total_time', value: _('Total Time (Seconds)') });
            columns.push({ type: 'total_time_str', value: _('Total Time') });
        }
        for (const i in tdoc.pids) {
            if (isExport) {
                columns.push({
                    type: 'problem_flag',
                    value: '#{0} {1}'.format(i + 1, pdict[tdoc.pids[i]].title),
                });
                columns.push({
                    type: 'problem_time',
                    value: '#{0} {1}'.format(i + 1, _('Time (Seconds)')),
                });
                columns.push({
                    type: 'problem_time_str',
                    value: '#{0} {1}'.format(i + 1, _('Time')),
                });
            } else {
                columns.push({
                    type: 'problem_detail',
                    value: '#{0}'.format(i + 1),
                    raw: pdict[tdoc.pids[i]],
                });
            }
        }
        const rows = [columns];
        for (const [rank, tsdoc] of rankedTsdocs) {
            const tsddict = {};
            if (tdoc.detail) { for (const item of tsdoc.journal) tsddict[item.pid] = item; }
            const row = [];
            row.push(
                { type: 'string', value: rank },
                { type: 'user', value: udict[tsdoc.uid].uname, raw: udict[tsdoc.uid] },
                { type: 'string', value: tsdoc.accept || 0 },
            );
            if (isExport) {
                row.push(
                    { type: 'string', value: tsdoc.time || 0.0 },
                    { type: 'string', value: tsdoc.time || 0.0 },
                );
            }
            for (const pid of tdoc.pids) {
                let rdoc;
                let colAccepted;
                let colTime;
                let colTimeStr;
                if ((tsddict[pid] || {}).accept) {
                    rdoc = tsddict[pid].rid;
                    colAccepted = _('Accepted');
                    colTime = tsddict[pid].time;
                    colTimeStr = colTime;
                } else {
                    rdoc = null;
                    colAccepted = '-';
                    colTime = '-';
                    colTimeStr = '-';
                }
                if (isExport) {
                    row.push({ type: 'string', value: colAccepted });
                    row.push({ type: 'string', value: colTime });
                    row.push({ type: 'string', value: colTimeStr });
                } else {
                    row.push({
                        type: 'record',
                        value: '{0}\n{1}'.format(colAccepted, colTimeStr),
                        raw: rdoc,
                    });
                }
                rows.push(row);
            }
        }
        return rows;
    },
    rank: (tdocs) => ranked(tdocs, (a, b) => a.score === b.score),
};

const oi = {
    TEXT: 'OI',
    check: () => { },
    stat: (tdoc, journal) => {
        const detail = {};
        let score = 0;
        for (const j in journal) {
            if (tdoc.pids.includes(j.pid)) {
                detail[j.pid] = j;
                score += j.score;
            }
        }
        return { score, detail };
    },
    showScoreboard(tdoc, now) {
        return now > tdoc.endAt;
    },
    showRecord(tdoc, now) {
        return now > tdoc.endAt;
    },
    scoreboard(isExport, _, tdoc, rankedTsdocs, udict, pdict) {
        const columns = [
            { type: 'rank', value: _('Rank') },
            { type: 'user', value: _('User') },
            { type: 'total_score', value: _('Total Score') },
        ];
        for (const i in tdoc.pids) {
            if (isExport) {
                columns.push({
                    type: 'problem_score',
                    value: '#{0} {1}'.format(i + 1, pdict[tdoc.pids[i]].title),
                });
            } else {
                columns.push({
                    type: 'problem_detail',
                    value: '#{0}'.format(i + 1),
                    raw: pdict[tdoc.pids[i]],
                });
            }
        }
        const rows = [columns];
        for (const [rank, tsdoc] of rankedTsdocs) {
            const tsddict = {};
            if (tsdoc.journal) { for (const item of tsdoc.journal) tsddict[item.pid] = item; }
            const row = [];
            row.push({ type: 'string', value: rank });
            row.push({ type: 'user', value: udict[tsdoc.uid].uname, raw: udict[tsdoc.uid] });
            row.push({ type: 'string', value: tsdoc.score || 0 });
            for (const pid of tdoc.pids) {
                row.push({
                    type: 'record',
                    value: (tsddict[pid] || {}).score || '-',
                    raw: (tsddict[pid] || {}).rid || null,
                });
            }
            rows.push(row);
        }
        return rows;
    },
    rank: (tdocs) => ranked(tdocs, (a, b) => a.score === b.score),
};


const RULES = {
    acm, oi,
};

/**
 * @typedef {import('bson').ObjectID} ObjectID
 * @typedef {import('../interface').Tdoc} Tdoc
 */

/**
 * @param {string} domainId
 * @param {string} title
 * @param {string} content
 * @param {number} owner
 * @param {string} rule
 * @param {Date} beginAt
 * @param {Date} endAt
 * @param {ObjectID[]} pids
 * @param {object} data
 * @returns {ObjectID} tid
 */
function add(domainId, title, content, owner, rule,
    beginAt = new Date(), endAt = new Date(), pids = [], rated = false,
    data = {}, type = document.TYPE_CONTEST) {
    validator.checkTitle(title);
    validator.checkContent(content);
    if (!this.RULES[rule]) throw new ValidationError('rule');
    if (beginAt >= endAt) throw new ValidationError('beginAt', 'endAt');
    Object.assign(data, {
        content, owner, title, rule, beginAt, endAt, pids, attend: 0,
    });
    this.RULES[rule].check(data);
    return document.add(domainId, content, owner, type, null, null, null, {
        ...data, title, rule, beginAt, endAt, pids, attend: 0, rated,
    });
}

/**
 * @param {string} domainId
 * @param {ObjectID} tid
 * @param {object} $set
 * @param {number} type
 * @returns {Tdoc} tdoc after modification
 */
async function edit(domainId, tid, $set, type = document.TYPE_CONTEST) {
    if ($set.rule) {
        if (!this.RULES[$set.rule]) throw new ValidationError('rule');
    }
    const tdoc = await document.get(domainId, type, tid);
    if (!tdoc) throw new ContestNotFoundError(tid);
    this.RULES[$set.rule || tdoc.rule].check(Object.assign(tdoc, $set));
    return await document.set(domainId, type, tid, $set);
}

/**
 * @param {string} domainId
 * @param {ObjectID} tid
 * @param {number} type
 * @returns {Promise<Tdoc>}
 */
async function get(domainId, tid, type = document.TYPE_CONTEST) {
    let tdoc;
    if (type === -1) {
        tdoc = await document.get(domainId, document.TYPE_CONTEST, tid);
        if (!tdoc) tdoc = await document.get(domainId, document.TYPE_HOMEWORK, tid);
    } else tdoc = await document.get(domainId, type, tid);
    if (!tdoc) throw new ContestNotFoundError(tid);
    return tdoc;
}

async function updateStatus(
    domainId, tid, uid, rid, pid,
    accept = false, score = 0, type = document.TYPE_CONTEST,
) {
    await get(domainId, tid, type);
    const tsdoc = await document.revPushStatus(domainId, type, tid, uid, 'journal', {
        rid, pid, accept, score,
    });
    if (!tsdoc.attend) throw new ContestNotAttendedError(tid, uid);
}

function getStatus(domainId, tid, uid, type = document.TYPE_CONTEST) {
    return document.getStatus(domainId, type, tid, uid);
}

async function getListStatus(domainId, uid, tids, type = document.TYPE_CONTEST) {
    const r = {};
    // eslint-disable-next-line no-await-in-loop
    for (const tid of tids) r[tid] = await getStatus(domainId, tid, uid, type);
    return r;
}

async function attend(domainId, tid, uid, type = document.TYPE_CONTEST) {
    try {
        await document.cappedIncStatus(domainId, type, tid, uid, 'attend', 1, 0, 1);
    } catch (e) {
        throw new ContestAlreadyAttendedError(tid, uid);
    }
    await document.inc(domainId, type, tid, 'attend', 1);
    return {};
}

function getMultiStatus(domainId, query, docType = document.TYPE_CONTEST) {
    return document.getMultiStatus(domainId, docType, query);
}

function isNew(tdoc, days = 1) {
    const now = new Date().getTime();
    const readyAt = tdoc.beginAt.getTime();
    return (now < readyAt - days * 24 * 3600 * 1000);
}
function isUpcoming(tdoc, days = 1) {
    const now = new Date().getTime();
    const readyAt = tdoc.beginAt.getTime();
    return (now > readyAt - days * 24 * 3600 * 1000 && now < tdoc.beginAt);
}
function isNotStarted(tdoc) {
    return (new Date()) < tdoc.beginAt;
}
function isOngoing(tdoc) {
    const now = new Date();
    return (tdoc.beginAt <= now && now < tdoc.endAt);
}
function isDone(tdoc) {
    return tdoc.endAt <= new Date();
}

const ContestHandlerMixin = (c) => class extends c {
    canViewHiddenScoreboard() {
        return this.user.hasPerm(PERM_VIEW_CONTEST_HIDDEN_SCOREBOARD);
    }

    canShowRecord(tdoc, allowPermOverride = true) {
        if (RULES[tdoc.rule].showRecord(tdoc, new Date())) return true;
        if (allowPermOverride && this.canViewHiddenScoreboard(tdoc)) return true;
        return false;
    }

    canShowScoreboard(tdoc, allowPermOverride = true) {
        if (RULES[tdoc.rule].showScoreboard(tdoc, new Date())) return true;
        if (allowPermOverride && this.canViewHiddenScoreboard(tdoc)) return true;
        return false;
    }

    async getScoreboard(domainId, tid, isExport = false, docType = document.TYPE_CONTEST) {
        const tdoc = await get(domainId, tid, docType);
        if (!this.canShowScoreboard(tdoc)) throw new ContestScoreboardHiddenError(tid);
        const tsdocs = await getMultiStatus(domainId, { docId: tid }, docType)
            .sort(RULES[tdoc.rule].statusSort).toArray();
        const uids = [];
        for (const tsdoc of tsdocs) uids.push(tsdoc.uid);
        const [udict, pdict] = await Promise.all([
            user.getList(domainId, uids),
            problem.getList(domainId, tdoc.pids),
        ]);
        const rankedTsdocs = RULES[tdoc.rule].rank(tsdocs);
        const rows = RULES[tdoc.rule].scoreboard(isExport, (str) => (str ? str.toString().translate(this.user.language) : ''), tdoc, rankedTsdocs, udict, pdict);
        return [tdoc, rows, udict];
    }

    async verifyProblems(domainId, pids) { // eslint-disable-line class-methods-use-this
        const r = [];
        for (const pid of pids) {
            const res = await problem.get(domainId, pid); // eslint-disable-line no-await-in-loop
            if (res) r.push(res.docId);
            else throw new ProblemNotFoundError(pid);
        }
        return r;
    }
};

function setStatus(domainId, tid, uid, $set) {
    return document.setStatus(domainId, document.TYPE_CONTEST, tid, uid, $set);
}

function count(domainId, query, type = document.TYPE_CONTEST) {
    return document.count(domainId, type, query);
}

function getMulti(domainId, query = {}, type = document.TYPE_CONTEST) {
    return document.getMulti(domainId, type, query);
}

function _getStatusJournal(tsdoc) {
    return tsdoc.journal.sort((a, b) => (a.rid.generationTime - b.rid.generationTime));
}

async function recalcStatus(domainId, tid, type) {
    const [tdoc, tsdocs] = await Promise.all([
        document.get(domainId, type, tid),
        document.getMultiStatus(domainId, type, { docId: tid }).toArray(),
    ]);
    const tasks = [];
    for (const tsdoc of tsdocs || []) {
        if (tsdoc.journal) {
            const journal = _getStatusJournal(tsdoc);
            const stats = RULES[tdoc.rule].stat(tdoc, journal);
            tasks.push(
                document.revSetStatus(
                    domainId, type, tid,
                    tsdoc.uid, tsdoc.rev, { journal, ...stats }, false,
                ),
            );
        }
    }
    return await Promise.all(tasks);
}

global.Hydro.model.contest = module.exports = {
    RULES,
    ContestHandlerMixin,
    add,
    getListStatus,
    getMultiStatus,
    attend,
    edit,
    get,
    updateStatus,
    getStatus,
    count,
    getMulti,
    setStatus,
    recalcStatus,
    isNew,
    isUpcoming,
    isNotStarted,
    isOngoing,
    isDone,
    statusText: (tdoc) => (
        isNew(tdoc)
            ? 'New'
            : isUpcoming(tdoc)
                ? 'Ready (☆▽☆)'
                : isOngoing(tdoc)
                    ? 'Live...'
                    : 'Done'),
    getStatusText: (tdoc) => (
        isNotStarted(tdoc)
            ? 'not_started'
            : isOngoing(tdoc)
                ? 'ongoing'
                : 'finished'),
};
