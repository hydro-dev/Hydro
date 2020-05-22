const user = require('./user');
const problem = require('./problem');
const {
    ValidationError, ContestNotFoundError, ContestAlreadyAttendedError,
    ContestNotAttendedError, ProblemNotFoundError, ContestScoreboardHiddenError,
} = require('../error');
const { PERM_VIEW_CONTEST_HIDDEN_SCOREBOARD } = require('../permission');
const validator = require('../lib/validator');
const ranked = require('../lib/rank');
const db = require('../service/db');

const coll = db.collection('contest');
const collStatus = db.collection('contest.status');

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
            if (tdoc.detail) { for (const item of tsdoc.detail) tsddict[item.pid] = item; }
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
async function add(title, content, owner, rule,
    beginAt = new Date(), endAt = new Date(), pids = [], data = {}) {
    validator.checkTitle(title);
    validator.checkContent(content);
    if (!this.RULES[rule]) throw new ValidationError('rule');
    if (beginAt >= endAt) throw new ValidationError('beginAt', 'endAt');
    Object.assign(data, {
        content, owner, title, rule, beginAt, endAt, pids, attend: 0,
    });
    this.RULES[rule].check(data);
    const res = await coll.insertOne(data);
    return res.insertedId;
}
/**
 * @param {ObjectID} tid
 * @param {object} $set
 * @returns {Tdoc} tdoc after modification
 */
async function edit(tid, $set) {
    if ($set.title) validator.checkTitle($set.title);
    if ($set.content) validator.checkIntro($set.content);
    if ($set.rule) { if (!this.RULES[$set.rule]) throw new ValidationError('rule'); }
    if ($set.beginAt && $set.endAt) {
        if ($set.beginAt >= $set.endAt) {
            throw new ValidationError('beginAt', 'endAt');
        }
    }
    const tdoc = await coll.findOne({ tid });
    if (!tdoc) throw new ContestNotFoundError(tid);
    this.RULES[$set.rule || tdoc.rule].check(Object.assign(tdoc, $set));
    await coll.findOneAndUpdate({ tid }, { $set });
    return tdoc;
}
/**
 * @param {ObjectID} tid
 * @returns {Tdoc}
 */
async function get(tid) {
    const tdoc = await coll.findOne({ _id: tid });
    if (!tdoc) throw new ContestNotFoundError(tid);
    return tdoc;
}
async function updateStatus(tid, uid, rid, pid, accept, score) {
    const tdoc = await get(tid);
    const tsdoc = await collStatus.findOneAndUpdate({ tid: tdoc._id, uid }, {
        $push: {
            journal: {
                rid, pid, accept, score,
            },
        },
        $inc: { rev: 1 },
    }, { upsert: true });
    if (!tsdoc.value.attend) throw new ContestNotAttendedError(tid, uid);
}
function getStatus(tid, uid) {
    return collStatus.findOne({ tid, uid });
}
async function getListStatus(uid, tids) {
    const r = {};
    // eslint-disable-next-line no-await-in-loop
    for (const tid of tids) r[tid] = await getStatus(tid, uid);
    return r;
}
async function attend(tid, uid) {
    try {
        await collStatus.insertOne({ tid, uid, attend: 1 });
    } catch (e) {
        throw new ContestAlreadyAttendedError(tid, uid);
    }
    await coll.findOneAndUpdate({ _id: tid }, { $inc: { attend: 1 } });
}
function getMultiStatus(query) {
    return collStatus.find(query);
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

    async getScoreboard(tid, isExport = false) {
        const tdoc = await get(tid);
        if (!this.canShowScoreboard(tdoc)) throw new ContestScoreboardHiddenError(tid);
        const tsdocs = await getMultiStatus(tid).sort(RULES[tdoc.rule].statusSort).toArray();
        const uids = [];
        for (const tsdoc of tsdocs) uids.push(tsdoc.uid);
        const [udict, pdict] = await Promise.all([user.getList(uids), problem.getList(tdoc.pids)]);
        const rankedTsdocs = RULES[tdoc.rule].rank(tsdocs);
        const rows = RULES[tdoc.rule].scoreboard(isExport, (str) => (str ? str.toString().translate(this.user.language) : ''), tdoc, rankedTsdocs, udict, pdict);
        return [tdoc, rows, udict];
    }

    async verifyProblems(pids) { // eslint-disable-line class-methods-use-this
        const r = [];
        for (const pid of pids) {
            const res = await problem.get(pid); // eslint-disable-line no-await-in-loop
            if (res) r.push(res._id);
            else throw new ProblemNotFoundError(pid);
        }
        return r;
    }
};

global.Hydro.model.contest = module.exports = {
    RULES,
    ContestHandlerMixin,
    add,
    getListStatus,
    attend,
    edit,
    get,
    updateStatus,
    getStatus,
    count: (query) => coll.find(query).count(),
    getMulti: (query) => coll.find(query),
    setStatus: (tid, uid, $set) => collStatus.findOneAndUpdate({ tid, uid }, { $set }),
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

/*

def _get_status_journal(tsdoc):
  # Sort and uniquify journal of the contest status document, by rid.
  return [list(g)[-1] for _, g in itertools.groupby(sorted(tsdoc['journal'], key=journal_key_func),
                                                    key=journal_key_func)]

@argmethod.wrap
async def recalc_status(domainId: str, doc_type: int, cid: objeccid.Objeccid):
  if doc_type not in [document.TYPE_CONTEST, document.TYPE_HOMEWORK]:
    raise error.InvalidArgumentError('doc_type')
  tdoc = await document.get(domainId, doc_type, cid)
  async with document.get_multi_status(domainId=domainId,
                                       doc_type=doc_type,
                                       doc_id=tdoc._id) as tsdocs:
    async for tsdoc in tsdocs:
      if 'journal' not in tsdoc or not tsdoc['journal']:
        continue
      journal = _get_status_journal(tsdoc)
      stats = RULES[tdoc['rule']].stat_func(tdoc, journal)
      await document.rev_set_status(domainId, doc_type, cid, tsdoc['uid'], tsdoc['rev'],
                                    return_doc=False, journal=journal, **stats)
*/
