import { ObjectID } from 'mongodb';
import * as user from './user';
import * as problem from './problem';
import {
    ValidationError, ContestNotFoundError, ContestAlreadyAttendedError,
    ContestNotAttendedError, ContestScoreboardHiddenError,
} from '../error';
import * as document from './document';
import { PERM } from './builtin';
import * as validator from '../lib/validator';
import * as misc from '../lib/misc';
import ranked from '../lib/rank';

interface Column {
    type: string,
    value: string,
    raw?: any
}

export interface Tdoc {
    _id: ObjectID,
    domainId: string,
    docId: ObjectID,
    docType: number,
    beginAt: Date,
    endAt: Date,
    penaltySince?: Date,
    attend: number,
    title: string,
    content: string,
    rule: string,
    pids: number[]
}

const acm = {
    TEXT: 'ACM/ICPC',
    check: () => { },
    showScoreboard: () => true,
    showRecord: (tdoc, now) => now > tdoc.endAt,
    stat: (tdoc, journal: any[]) => {
        const naccept = {};
        const effective = {};
        const detail = [];
        let accept = 0;
        let time = 0;
        for (const j of journal) {
            if (tdoc.pids.includes(j.pid)
                && !(effective[j.pid] && effective[j.pid].accept)) {
                effective[j.pid] = j;
            }
            if (!j.accept) naccept[j.pid]++;
        }
        function _time(jdoc) {
            const real = jdoc.rid.generationTime - Math.floor(tdoc.begin_at / 1000);
            const penalty = 20 * 60 * naccept[jdoc.pid];
            return real + penalty;
        }
        for (const j in effective) {
            detail.push({
                ...effective[j], naccept: naccept[effective[j].pid], time: _time(effective[j]),
            });
        }
        for (const d of detail) {
            accept += d.accept;
            if (d.accept) time += d.time;
        }
        return { accept, time, detail };
    },
    scoreboard(isExport: boolean, _: (s: string) => string, tdoc, rankedTsdocs, udict, pdict) {
        const columns: Column[] = [
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
            if (tdoc.detail) {
                for (const item of tsdoc.journal) tsddict[item.pid] = item;
            }
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
        for (const j of journal) {
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
        const columns: Column[] = [
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

const homework = {
    TEXT: 'Assignment',
    check: () => { },
    stat: (tdoc, journal) => {
        const effective = {};
        for (const j of journal) {
            if (tdoc.pids.includes(j.pid)
                && !effective[j.pid]
                && journal[j.pid].accept) {
                effective[j.pid] = j;
            }
        }
        function time(jdoc) {
            const real = jdoc.rid.generationTime - tdoc.beginAt.getTime() / 1000;
            return Math.floor(real);
        }
        function penaltyScore(jdoc) {
            const { score } = jdoc;
            const exceedSeconds = Math.floor(
                jdoc.rid.generationTime - tdoc.penaltySince.getTime() / 1000,
            );
            if (exceedSeconds < 0) return score;
            let coefficient = 1;
            const keys = Object.keys(tdoc.penaltyRules)
                .map((k) => parseFloat(k)).sort((a, b) => a - b);
            for (const i of keys) {
                if (i * 3600 <= exceedSeconds) coefficient = tdoc.penaltyRules[i];
                else break;
            }
            return score * coefficient;
        }
        const detail = [];
        for (const j in effective) {
            detail.push({
                ...effective[j],
                penaltyScore: penaltyScore(effective[j]),
                time: time(j),
            });
        }
        return {
            score: Math.sum(detail.map((d) => d.score)),
            penaltyScore: Math.sum(detail.map((d) => d.penaltySince)),
            time: Math.sum(detail.map((d) => d.time)),
            detail,
        };
    },
    showScoreboard: () => true,
    showRecord: () => true,
    scoreboard(isExport, _, tdoc, rankedTsdocs, udict, pdict) {
        const columns: Column[] = [
            { type: 'rank', value: _('Rank') },
            { type: 'user', value: _('User') },
            { type: 'total_score', value: _('Score') },
        ];
        if (isExport) {
            columns.push(
                { type: 'total_original_score', value: _('Original Score') },
                { type: 'total_time', value: _('Total Time (Seconds)') },
            );
        }
        columns.push({ type: 'total_time_str', value: _('Total Time') });
        for (const index in tdoc.pids) {
            const pid = tdoc.pids[index];
            if (isExport) {
                columns.push(
                    {
                        type: 'problem_score',
                        value: '#{0} {1}'.format(index + 1, pdict[pid].title),
                    },
                    {
                        type: 'problem_original_score',
                        value: '#{0} {1}'.format(index + 1, _('Original Score')),
                    },
                    {
                        type: 'problem_time',
                        value: '#{0} {1}'.format(index + 1, _('Time (Seconds)')),
                    },
                    {
                        type: 'problem_time_str',
                        value: '#{0} {1}'.format(index + 1, _('Time')),
                    },
                );
            } else {
                columns.push({
                    type: 'problem_detail',
                    value: '#{0}'.format(index + 1),
                    raw: pdict[pid],
                });
            }
        }
        const rows = [columns];
        for (const [rank, tsdoc] of rankedTsdocs) {
            const tsddict = {};
            for (const item of tsdoc.journal || []) {
                tsddict[item.pid] = item;
            }
            const row = [
                { type: 'string', value: rank },
                {
                    type: 'user',
                    value: udict[tsdoc.uid].uname,
                    raw: udict[tsdoc.uid],
                },
                {
                    type: 'string',
                    value: tsdoc.penaltyScore || 0,
                },
            ];
            if (isExport) {
                row.push({ type: 'string', value: tsdoc.score || 0 });
                row.push({ type: 'string', value: tsdoc.time || 0.0 });
            }
            row.push({ type: 'string', value: misc.formatSeconds(tsdoc.time || 0) });
            for (const pid of tdoc.pids) {
                const rdoc = (tsddict[pid] || {}).rid;
                const colScore = (tsddict[pid] || {}).penaltyScore || '-';
                const colOriginalScore = (tsddict[pid] || {}).score || '-';
                const colTime = (tsddict[pid] || {}).time || '-';
                const colTimeStr = colTime !== '-' ? misc.formatSeconds(colTime || 0) : '-';
                if (isExport) {
                    row.push(
                        { type: 'string', value: colScore },
                        { type: 'string', value: colOriginalScore },
                        { type: 'string', value: colTime },
                        { type: 'string', value: colTimeStr },
                    );
                } else {
                    row.push({
                        type: 'record',
                        value: '{0} / {1}\n{2}'.format(colScore, colOriginalScore, colTimeStr),
                        raw: rdoc,
                    });
                }
            }
            rows.push(row);
        }
        return rows;
    },
    rank: (tsdocs) => ranked(tsdocs, (a, b) => a.score === b.score),
};

export const RULES = {
    acm, oi, homework,
};

export function add(
    domainId: string, title: string, content: string, owner: number,
    rule: string, beginAt = new Date(), endAt = new Date(), pids = [],
    rated = false, data = {}, type = document.TYPE_CONTEST,
) {
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

export async function edit(
    domainId: string, tid: ObjectID,
    $set: any, type = document.TYPE_CONTEST,
) {
    if ($set.rule) {
        if (!this.RULES[$set.rule]) throw new ValidationError('rule');
    }
    const tdoc = await document.get(domainId, type, tid);
    if (!tdoc) throw new ContestNotFoundError(tid);
    this.RULES[$set.rule || tdoc.rule].check(Object.assign(tdoc, $set));
    return await document.set(domainId, type, tid, $set);
}

export async function get(domainId: string, tid: ObjectID, type = document.TYPE_CONTEST) {
    let tdoc;
    if (type === -1) {
        tdoc = await document.get(domainId, document.TYPE_CONTEST, tid);
        if (!tdoc) tdoc = await document.get(domainId, document.TYPE_HOMEWORK, tid);
    } else tdoc = await document.get(domainId, type, tid);
    if (!tdoc) throw new ContestNotFoundError(tid);
    return tdoc;
}

export async function updateStatus(
    domainId: string, tid: ObjectID, uid: number, rid: ObjectID, pid: number,
    accept = false, score = 0, type = document.TYPE_CONTEST,
) {
    await get(domainId, tid, type);
    const tsdoc = await document.revPushStatus(domainId, type, tid, uid, 'journal', {
        rid, pid, accept, score,
    });
    if (!tsdoc.attend) throw new ContestNotAttendedError(tid, uid);
}

export function getStatus(
    domainId: string, tid: ObjectID, uid: number,
    type = document.TYPE_CONTEST,
) {
    return document.getStatus(domainId, type, tid, uid);
}

export async function getListStatus(
    domainId: string, uid: number, tids: ObjectID[],
    type = document.TYPE_CONTEST,
) {
    const r = {};
    // eslint-disable-next-line no-await-in-loop
    for (const tid of tids) r[tid.toHexString()] = await getStatus(domainId, tid, uid, type);
    return r;
}

export async function attend(
    domainId: string, tid: ObjectID, uid: number,
    type = document.TYPE_CONTEST,
) {
    try {
        await document.cappedIncStatus(domainId, type, tid, uid, 'attend', 1, 0, 1);
    } catch (e) {
        throw new ContestAlreadyAttendedError(tid, uid);
    }
    await document.inc(domainId, type, tid, 'attend', 1);
    return {};
}

export function getMultiStatus(domainId: string, query: any, docType = document.TYPE_CONTEST) {
    return document.getMultiStatus(domainId, docType, query);
}

export function isNew(tdoc: Tdoc, days = 1) {
    const now = new Date().getTime();
    const readyAt = tdoc.beginAt.getTime();
    return (now < readyAt - days * 24 * 3600 * 1000);
}

export function isUpcoming(tdoc: Tdoc, days = 1) {
    const now = new Date().getTime();
    const readyAt = tdoc.beginAt.getTime();
    return (now > readyAt - days * 24 * 3600 * 1000 && now < tdoc.beginAt.getTime());
}

export function isNotStarted(tdoc: Tdoc) {
    return (new Date()) < tdoc.beginAt;
}

export function isOngoing(tdoc: Tdoc) {
    const now = new Date();
    return (tdoc.beginAt <= now && now < tdoc.endAt);
}

export function isDone(tdoc: Tdoc) {
    return tdoc.endAt <= new Date();
}

export function isExtended(tdoc: Tdoc) {
    const now = new Date().getTime();
    return tdoc.penaltySince.getTime() <= now && now < tdoc.endAt.getTime();
}

export const ContestHandlerMixin = (c) => class extends c {
    canViewHiddenScoreboard() {
        return this.user.hasPerm(PERM.PERM_VIEW_CONTEST_HIDDEN_SCOREBOARD);
    }

    canShowRecord(tdoc: Tdoc, allowPermOverride = true) {
        if (RULES[tdoc.rule].showRecord(tdoc, new Date())) return true;
        if (allowPermOverride && this.canViewHiddenScoreboard()) return true;
        return false;
    }

    canShowScoreboard(tdoc: Tdoc, allowPermOverride = true) {
        if (RULES[tdoc.rule].showScoreboard(tdoc, new Date())) return true;
        if (allowPermOverride && this.canViewHiddenScoreboard()) return true;
        return false;
    }

    async getScoreboard(
        domainId: string, tid: ObjectID,
        isExport = false, docType = document.TYPE_CONTEST,
    ) {
        const tdoc = await get(domainId, tid, docType);
        if (!this.canShowScoreboard(tdoc)) throw new ContestScoreboardHiddenError(tid);
        const tsdocs = await getMultiStatus(domainId, { docId: tid }, docType)
            .sort(RULES[tdoc.rule].statusSort).toArray();
        const uids = [];
        for (const tsdoc of tsdocs) uids.push(tsdoc.uid);
        const [udict, pdict] = await Promise.all([
            user.getList(domainId, uids),
            problem.getList(domainId, tdoc.pids, true),
        ]);
        const rankedTsdocs = RULES[tdoc.rule].rank(tsdocs);
        const rows = RULES[tdoc.rule].scoreboard(isExport, (str) => (str ? str.toString().translate(this.user.language) : ''), tdoc, rankedTsdocs, udict, pdict);
        return [tdoc, rows, udict];
    }

    // eslint-disable-next-line class-methods-use-this
    async verifyProblems(domainId: string, pids: number[]) {
        await problem.getList(domainId, pids, true);
        return pids;
    }
};

export function setStatus(domainId: string, tid: ObjectID, uid: number, $set: any) {
    return document.setStatus(domainId, document.TYPE_CONTEST, tid, uid, $set);
}

export function count(domainId: string, query: any, type = document.TYPE_CONTEST) {
    return document.count(domainId, type, query);
}

export function getMulti(domainId: string, query = {}, type = document.TYPE_CONTEST) {
    return document.getMulti(domainId, type, query);
}

export function _getStatusJournal(tsdoc) {
    return tsdoc.journal.sort((a, b) => (a.rid.generationTime - b.rid.generationTime));
}

export async function getAndListStatus(
    domainId: string, tid: ObjectID, docType = document.TYPE_CONTEST,
) {
    // TODO(iceboy): projection, pagination.
    const tdoc = await get(domainId, tid, docType);
    const tsdocs = await document.getMultiStatus(domainId, docType, { docId: tid })
        .sort(RULES[tdoc.rule].statusSort).toArray();
    return [tdoc, tsdocs];
}

export async function recalcStatus(domainId: string, tid: ObjectID, type = document.TYPE_CONTEST) {
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

export const statusText = (tdoc: Tdoc) => (
    isNew(tdoc)
        ? 'New'
        : isUpcoming(tdoc)
            ? 'Ready (☆▽☆)'
            : isOngoing(tdoc)
                ? 'Live...'
                : 'Done');

export const getStatusText = (tdoc: Tdoc) => (
    isNotStarted(tdoc)
        ? 'not_started'
        : isOngoing(tdoc)
            ? 'ongoing'
            : 'finished');

global.Hydro.model.contest = {
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
    getAndListStatus,
    recalcStatus,
    isNew,
    isUpcoming,
    isNotStarted,
    isOngoing,
    isDone,
    isExtended,
    statusText,
    getStatusText,
};
