import { FilterQuery, ObjectID } from 'mongodb';
import {
    ContestAlreadyAttendedError, ContestNotAttendedError, ContestNotFoundError,
    ContestScoreboardHiddenError, ValidationError,
} from '../error';
import {
    ContestRule, ContestRules, ProblemDict,
    ScoreboardNode, ScoreboardRow, Tdoc,
    Udict,
} from '../interface';
import * as misc from '../lib/misc';
import ranked from '../lib/rank';
import * as bus from '../service/bus';
import { PERM, STATUS } from './builtin';
import * as document from './document';
import problem from './problem';
import user from './user';

interface AcmJournal {
    rid: ObjectID;
    pid: number;
    score: number;
    status: number;
    time: number;
}
interface AcmDetail extends AcmJournal {
    naccept?: number;
    penalty: number;
    real: number;
}

const acm: ContestRule = {
    TEXT: 'ACM/ICPC',
    check: () => { },
    statusSort: { accept: -1, time: 1 },
    showScoreboard: () => true,
    showSelfRecord: () => true,
    showRecord: (tdoc, now) => now > tdoc.endAt,
    stat: (tdoc, journal: AcmJournal[]) => {
        const naccept: Record<number, number> = {};
        const effective: Record<number, AcmJournal> = {};
        const detail: AcmDetail[] = [];
        let accept = 0;
        let time = 0;
        for (const j of journal) {
            if (tdoc.pids.includes(j.pid)
                && effective[j.pid]?.status !== STATUS.STATUS_ACCEPTED) {
                effective[j.pid] = j;
                if (![STATUS.STATUS_ACCEPTED, STATUS.STATUS_COMPILE_ERROR].includes(j.status)) {
                    naccept[j.pid] = (naccept[j.pid] || 0) + 1;
                }
            }
        }
        for (const key in effective) {
            const j = effective[key];
            const real = j.rid.generationTime - Math.floor(tdoc.beginAt.getTime() / 1000);
            const penalty = 20 * 60 * (naccept[j.pid] || 0);
            detail.push({
                ...j, naccept: naccept[j.pid] || 0, time: real + penalty, real, penalty,
            });
        }
        for (const d of detail) {
            if (d.status === STATUS.STATUS_ACCEPTED) {
                accept += 1;
                time += d.time;
            }
        }
        return { accept, time, detail };
    },
    async scoreboard(isExport, _, tdoc, pdict, cursor, page) {
        const [rankedTsdocs, nPages] = await ranked(cursor, (a, b) => a.score === b.score && a.time === b.time, page);
        const uids = rankedTsdocs.map(([, tsdoc]) => tsdoc.uid);
        const udict = await user.getList(tdoc.domainId, uids);
        const columns: ScoreboardRow = [
            { type: 'rank', value: _('Rank') },
            { type: 'user', value: _('User') },
            { type: 'solved_problems', value: _('Solved Problems') },
        ];
        if (isExport) {
            columns.push(
                { type: 'total_time', value: _('Total Time (Seconds)') },
                { type: 'total_time_str', value: _('Total Time') },
            );
        }
        for (let i = 1; i <= tdoc.pids.length; i++) {
            const pid = tdoc.pids[i - 1];
            if (isExport) {
                columns.push(
                    {
                        type: 'problem_flag',
                        value: '#{0} {1}'.format(i, pdict[pid].title),
                    },
                    {
                        type: 'problem_time',
                        value: '#{0} {1}'.format(i, _('Time (Seconds)')),
                    },
                    {
                        type: 'problem_time_str',
                        value: '#{0} {1}'.format(i, _('Time')),
                    },
                );
            } else {
                columns.push({
                    type: 'problem_detail',
                    value: '#{0}'.format(i),
                    raw: pid,
                });
            }
        }
        const first = {};
        for (const pid of tdoc.pids) first[pid] = new ObjectID().generationTime;
        for (const [, tsdoc] of rankedTsdocs) {
            const tsddict = {};
            for (const item of tsdoc.journal || []) tsddict[item.pid] = item;
            for (const pid of tdoc.pids) {
                if (tsddict[pid]?.status === STATUS.STATUS_ACCEPTED && tsddict[pid].rid.generationTime < first[pid]) {
                    first[pid] = tsddict[pid].rid.generationTime;
                }
            }
        }
        const rows: ScoreboardRow[] = [columns];
        for (const [rank, tsdoc] of rankedTsdocs) {
            const tsddict = {};
            for (const item of tsdoc.detail || []) tsddict[item.pid] = item;
            const row: ScoreboardRow = [
                { type: 'string', value: rank.toString() },
                { type: 'user', value: udict[tsdoc.uid].uname, raw: tsdoc.uid },
                { type: 'string', value: tsdoc.accept || 0 },
            ];
            if (isExport) {
                row.push(
                    { type: 'string', value: tsdoc.time || 0.0 },
                    { type: 'string', value: tsdoc.time || 0.0 },
                );
            }
            for (const pid of tdoc.pids) {
                const doc = tsddict[pid] || {};
                const accept = doc.status === STATUS.STATUS_ACCEPTED;
                const rid = accept ? doc.rid : null;
                const colAccepted = `${accept ? `${_('Accepted')} ` : ''}${doc.naccept ? ` (-${doc.naccept})` : ''}`;
                const colTime = accept ? doc.time : '-';
                const colTimeStr = accept ? misc.formatSeconds(colTime) : '-';
                if (isExport) {
                    row.push(
                        { type: 'string', value: colAccepted },
                        { type: 'string', value: colTime },
                        { type: 'string', value: colTimeStr },
                    );
                } else {
                    row.push({
                        type: 'record',
                        score: accept ? 100 : 0,
                        value: '{0}\n{1}'.format(colAccepted, colTimeStr),
                        raw: rid,
                        style: accept && rid.generationTime === first[pid]
                            ? 'background-color: rgb(217, 240, 199);'
                            : undefined,
                    });
                }
            }
            row.raw = tsdoc;
            rows.push(row);
        }
        return [rows, udict, nPages];
    },
    async ranked(tdoc, cursor) {
        return await ranked.all(cursor, (a, b) => a.score === b.score);
    },
};

const oi: ContestRule = {
    TEXT: 'OI',
    check: () => { },
    statusSort: { score: -1 },
    stat: (tdoc, journal) => {
        const detail = {};
        let score = 0;
        for (const j of journal) {
            if (tdoc.pids.includes(j.pid)) detail[j.pid] = j;
        }
        for (const i in detail) score += detail[i].score;
        return { score, detail };
    },
    showScoreboard: (tdoc, now) => now > tdoc.endAt,
    showSelfRecord: (tdoc, now) => now > tdoc.endAt,
    showRecord: (tdoc, now) => now > tdoc.endAt,
    async scoreboard(isExport, _, tdoc, pdict, cursor, page) {
        const [rankedTsdocs, nPages] = await ranked(cursor, (a, b) => a.score === b.score, page);
        const uids = rankedTsdocs.map(([, tsdoc]) => tsdoc.uid);
        const udict = await user.getList(tdoc.domainId, uids);
        const columns: ScoreboardNode[] = [
            { type: 'rank', value: _('Rank') },
            { type: 'user', value: _('User') },
            { type: 'total_score', value: _('Total Score') },
        ];
        for (let i = 1; i <= tdoc.pids.length; i++) {
            if (isExport) {
                columns.push({
                    type: 'problem_score',
                    value: '#{0} {1}'.format(i, pdict[tdoc.pids[i - 1]].title),
                });
            } else {
                columns.push({
                    type: 'problem_detail',
                    value: '#{0}'.format(i),
                    raw: tdoc.pids[i - 1],
                });
            }
        }
        const psdict = {};
        const first = {};
        for (const pid of tdoc.pids) first[pid] = new ObjectID().generationTime;
        for (const [, tsdoc] of rankedTsdocs) {
            const tsddict = {};
            for (const item of tsdoc.journal || []) tsddict[item.pid] = item;
            for (const pid of tdoc.pids) {
                if (tsddict[pid]?.status === STATUS.STATUS_ACCEPTED && tsddict[pid].rid.generationTime < first[pid]) {
                    first[pid] = tsddict[pid].rid.generationTime;
                }
            }
        }
        // eslint-disable-next-line @typescript-eslint/no-use-before-define
        if (isDone(tdoc)) {
            const psdocs = await Promise.all(
                tdoc.pids.map((pid) => problem.getMultiStatus(tdoc.domainId, { docId: pid, uid: { $in: uids } }).toArray()),
            );
            for (const tpsdoc of psdocs) {
                for (const psdoc of tpsdoc) {
                    psdict[`${psdoc.uid}/${psdoc.domainId}/${psdoc.docId}`] = psdoc;
                }
            }
        }
        const rows = [columns];
        for (const [rank, tsdoc] of rankedTsdocs) {
            const tsddict = {};
            if (tsdoc.journal) {
                for (const item of tsdoc.journal) tsddict[item.pid] = item;
            }
            const row = [];
            row.push(
                { type: 'string', value: rank },
                { type: 'user', value: udict[tsdoc.uid].uname, raw: tsdoc.uid },
                { type: 'string', value: tsdoc.score || 0 },
            );
            for (const pid of tdoc.pids) {
                const index = `${tsdoc.uid}/${tdoc.domainId}/${pid}`;
                // eslint-disable-next-line @typescript-eslint/no-use-before-define
                const node: ScoreboardNode = (!isExport && isDone(tdoc) && tsddict[pid]?.rid?.toHexString() !== psdict[index]?.rid?.toHexString())
                    ? {
                        type: 'records',
                        value: '',
                        raw: [{
                            value: tsddict[pid]?.score ?? '-',
                            raw: tsddict[pid]?.rid || null,
                        }, {
                            value: psdict[index]?.score ?? '-',
                            raw: psdict[index]?.rid ?? null,
                        }],
                    } : {
                        type: 'record',
                        value: tsddict[pid]?.score ?? '-',
                        raw: tsddict[pid]?.rid || null,
                    };
                if (tsddict[pid]?.status === STATUS.STATUS_ACCEPTED && tsddict[pid]?.rid.generationTime === first[pid]) {
                    node.style = 'background-color: rgb(217, 240, 199);';
                }
                row.push(node);
            }
            rows.push(row);
        }
        return [rows, udict, nPages];
    },
    async ranked(tdoc, cursor) {
        return await ranked.all(cursor, (a, b) => a.score === b.score);
    },
};

const ioi: ContestRule = {
    ...oi,
    TEXT: 'IOI',
    showRecord: (tdoc, now) => now > tdoc.endAt,
    showSelfRecord: () => true,
    showScoreboard: () => true,
};

const homework: ContestRule = {
    TEXT: 'Assignment',
    check: () => { },
    statusSort: { penaltyScore: -1, time: 1 },
    stat: (tdoc, journal) => {
        const effective = {};
        for (const j of journal) {
            if (tdoc.pids.includes(j.pid)) {
                effective[j.pid] = j;
            }
        }
        function time(jdoc) {
            const real = jdoc.rid.generationTime - tdoc.beginAt.getTime() / 1000;
            return Math.floor(real);
        }

        function penaltyScore(jdoc) {
            const exceedSeconds = Math.floor(
                jdoc.rid.generationTime - tdoc.penaltySince.getTime() / 1000,
            );
            if (exceedSeconds < 0) return jdoc.score;
            let coefficient = 1;
            const keys = Object.keys(tdoc.penaltyRules).map(parseFloat).sort((a, b) => a - b);
            for (const i of keys) {
                if (i * 3600 <= exceedSeconds) coefficient = tdoc.penaltyRules[i];
                else break;
            }
            return jdoc.score * coefficient;
        }
        const detail = [];
        for (const j in effective) {
            detail.push({
                ...effective[j],
                penaltyScore: penaltyScore(effective[j]),
                time: time(effective[j]),
            });
        }
        return {
            score: Math.sum(detail.map((d) => d.score)),
            penaltyScore: Math.sum(detail.map((d) => d.penaltyScore)),
            time: Math.sum(detail.map((d) => d.time)),
            detail,
        };
    },
    showScoreboard: () => true,
    showSelfRecord: () => true,
    showRecord: () => true,
    async scoreboard(isExport, _, tdoc, pdict, cursor, page) {
        const [rankedTsdocs, nPages] = await ranked(cursor, (a, b) => a.score === b.score, page);
        const uids = rankedTsdocs.map(([, tsdoc]) => tsdoc.uid);
        const udict = await user.getList.call(this, tdoc.domainId, uids);
        const columns: ScoreboardNode[] = [
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
        for (let i = 1; i <= tdoc.pids.length; i++) {
            const pid = tdoc.pids[i - 1];
            if (isExport) {
                columns.push(
                    {
                        type: 'problem_score',
                        value: '#{0} {1}'.format(i, pdict[pid].title),
                    },
                    {
                        type: 'problem_original_score',
                        value: '#{0} {1}'.format(i, _('Original Score')),
                    },
                    {
                        type: 'problem_time',
                        value: '#{0} {1}'.format(i, _('Time (Seconds)')),
                    },
                    {
                        type: 'problem_time_str',
                        value: '#{0} {1}'.format(i, _('Time')),
                    },
                );
            } else {
                columns.push({
                    type: 'problem_detail',
                    value: '#{0}'.format(i),
                    raw: pid,
                });
            }
        }
        const rows: ScoreboardRow[] = [columns];
        for (const [rank, tsdoc] of rankedTsdocs) {
            const tsddict = {};
            for (const item of tsdoc.detail || []) {
                tsddict[item.pid] = item;
            }
            const row: ScoreboardRow = [
                { type: 'string', value: rank },
                {
                    type: 'user',
                    value: udict[tsdoc.uid].uname,
                    raw: tsdoc.uid,
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
                const rid = tsddict[pid]?.rid;
                const colScore = tsddict[pid]?.penaltyScore || '-';
                const colOriginalScore = tsddict[pid]?.score || '-';
                const colTime = tsddict[pid]?.time || '-';
                const colTimeStr = colTime !== '-' ? misc.formatSeconds(colTime) : '-';
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
                        score: tsddict[pid]?.penaltyScore || 0,
                        value: colScore === colOriginalScore
                            ? '{0}\n{1}'.format(colScore, colTimeStr)
                            : '{0} / {1}\n{2}'.format(colScore, colOriginalScore, colTimeStr),
                        raw: rid,
                    });
                }
            }
            rows.push(row);
        }
        return [rows, udict, nPages];
    },
    async ranked(tdoc, cursor) {
        return await ranked.all(cursor, (a, b) => a.score === b.score);
    },
};

export const RULES: ContestRules = {
    acm, oi, homework, ioi,
};

function _getStatusJournal(tsdoc) {
    return tsdoc.journal.sort((a, b) => (a.rid.generationTime - b.rid.generationTime));
}

export async function add(
    domainId: string, title: string, content: string, owner: number,
    rule: string, beginAt = new Date(), endAt = new Date(), pids: number[] = [],
    rated = false, data: Partial<Tdoc> = {},
) {
    if (!this.RULES[rule]) throw new ValidationError('rule');
    if (beginAt >= endAt) throw new ValidationError('beginAt', 'endAt');
    Object.assign(data, {
        content, owner, title, rule, beginAt, endAt, pids, attend: 0,
    });
    this.RULES[rule].check(data);
    await bus.serial('contest/before-add', data);
    const res = await document.add(domainId, content, owner, document.TYPE_CONTEST, null, null, null, {
        ...data, title, rule, beginAt, endAt, pids, attend: 0, rated,
    });
    await bus.serial('contest/add', data, res);
    return res;
}

export async function edit(domainId: string, tid: ObjectID, $set: any) {
    if ($set.rule && !this.RULES[$set.rule]) throw new ValidationError('rule');
    const tdoc = await document.get(domainId, document.TYPE_CONTEST, tid);
    if (!tdoc) throw new ContestNotFoundError(domainId, tid);
    this.RULES[$set.rule || tdoc.rule].check(Object.assign(tdoc, $set));
    return await document.set(domainId, document.TYPE_CONTEST, tid, $set);
}

export async function del(domainId: string, tid: ObjectID) {
    await Promise.all([
        document.deleteOne(domainId, document.TYPE_CONTEST, tid),
        document.deleteMultiStatus(domainId, document.TYPE_CONTEST, { docId: tid }),
        document.deleteMulti(domainId, document.TYPE_DISCUSSION, { parentType: document.TYPE_CONTEST, parentId: tid }),
    ]);
}

export async function get(domainId: string, tid: ObjectID): Promise<Tdoc<30>> {
    const tdoc = await document.get(domainId, document.TYPE_CONTEST, tid);
    if (!tdoc) throw new ContestNotFoundError(tid);
    return tdoc;
}

export async function getRelated(domainId: string, pid: number) {
    return await document.getMulti(domainId, document.TYPE_CONTEST, { pids: pid }).toArray();
}

export function getStatus(domainId: string, tid: ObjectID, uid: number) {
    return document.getStatus(domainId, document.TYPE_CONTEST, tid, uid);
}

export async function updateStatus(
    domainId: string, tid: ObjectID, uid: number, rid: ObjectID, pid: number,
    status = STATUS.STATUS_WRONG_ANSWER, score = 0,
) {
    const [tdoc, otsdoc] = await Promise.all([
        get(domainId, tid),
        getStatus(domainId, tid, uid),
    ]);
    if (!otsdoc.attend) throw new ContestNotAttendedError(tid, uid);
    const tsdoc = await document.revPushStatus(domainId, document.TYPE_CONTEST, tid, uid, 'journal', {
        rid, pid, status, score,
    }, 'rid');
    const journal = _getStatusJournal(tsdoc);
    const stats = RULES[tdoc.rule].stat(tdoc, journal);
    return await document.revSetStatus(domainId, document.TYPE_CONTEST, tid, uid, tsdoc.rev, { journal, ...stats });
}

export async function getListStatus(domainId: string, uid: number, tids: ObjectID[]) {
    const r = {};
    // eslint-disable-next-line no-await-in-loop
    for (const tid of tids) r[tid.toHexString()] = await getStatus(domainId, tid, uid);
    return r;
}

export async function attend(domainId: string, tid: ObjectID, uid: number) {
    try {
        await document.cappedIncStatus(domainId, document.TYPE_CONTEST, tid, uid, 'attend', 1, 0, 1);
    } catch (e) {
        throw new ContestAlreadyAttendedError(tid, uid);
    }
    await document.inc(domainId, document.TYPE_CONTEST, tid, 'attend', 1);
    return {};
}

export function getMultiStatus(domainId: string, query: any) {
    return document.getMultiStatus(domainId, document.TYPE_CONTEST, query);
}

export function isNew(tdoc: Tdoc, days = 1) {
    const now = new Date().getTime();
    const readyAt = tdoc.beginAt.getTime();
    return (now < readyAt - days * 24 * 3600 * 1000);
}

export function isUpcoming(tdoc: Tdoc, days = 7) {
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

export function setStatus(domainId: string, tid: ObjectID, uid: number, $set: any) {
    return document.setStatus(domainId, document.TYPE_CONTEST, tid, uid, $set);
}

export function count(domainId: string, query: any) {
    return document.count(domainId, document.TYPE_CONTEST, query);
}

export function getMulti(
    domainId: string, query: FilterQuery<document.DocType['30']> = {},
) {
    return document.getMulti(domainId, document.TYPE_CONTEST, query).sort({ beginAt: -1 });
}

export async function getAndListStatus(domainId: string, tid: ObjectID): Promise<[Tdoc, any[]]> {
    // TODO(iceboy): projection, pagination.
    const tdoc = await get(domainId, tid);
    const tsdocs = await document.getMultiStatus(domainId, document.TYPE_CONTEST, { docId: tid })
        .sort(RULES[tdoc.rule].statusSort).toArray();
    return [tdoc, tsdocs];
}

export async function recalcStatus(domainId: string, tid: ObjectID) {
    const [tdoc, tsdocs] = await Promise.all([
        document.get(domainId, document.TYPE_CONTEST, tid),
        document.getMultiStatus(domainId, document.TYPE_CONTEST, { docId: tid }).toArray(),
    ]);
    const tasks = [];
    for (const tsdoc of tsdocs || []) {
        if (tsdoc.journal) {
            const journal = _getStatusJournal(tsdoc);
            const stats = RULES[tdoc.rule].stat(tdoc, journal);
            tasks.push(
                document.revSetStatus(
                    domainId, document.TYPE_CONTEST, tid,
                    tsdoc.uid, tsdoc.rev, { journal, ...stats },
                ),
            );
        }
    }
    return await Promise.all(tasks);
}

export function canViewHiddenScoreboard() {
    return this.user.hasPerm(PERM.PERM_VIEW_CONTEST_HIDDEN_SCOREBOARD);
}

export function canShowRecord(tdoc: Tdoc<30>, allowPermOverride = true) {
    if (RULES[tdoc.rule].showRecord(tdoc, new Date())) return true;
    if (allowPermOverride && canViewHiddenScoreboard.call(this)) return true;
    return false;
}

export function canShowSelfRecord(tdoc: Tdoc<30>, allowPermOverride = true) {
    if (RULES[tdoc.rule].showSelfRecord(tdoc, new Date())) return true;
    if (allowPermOverride && canViewHiddenScoreboard.call(this)) return true;
    return false;
}

export function canShowScoreboard(tdoc: Tdoc<30>, allowPermOverride = true) {
    if (RULES[tdoc.rule].showScoreboard(tdoc, new Date())) return true;
    if (allowPermOverride && canViewHiddenScoreboard.call(this)) return true;
    return false;
}

export async function getScoreboard(
    domainId: string, tid: ObjectID,
    isExport = false, page: number,
): Promise<[Tdoc<30 | 60>, ScoreboardRow[], Udict, ProblemDict, number]> {
    const tdoc = await get(domainId, tid);
    if (!canShowScoreboard.call(this, tdoc)) throw new ContestScoreboardHiddenError(tid);
    const tsdocsCursor = getMultiStatus(domainId, { docId: tid }).sort(RULES[tdoc.rule].statusSort);
    const pdict = await problem.getList(domainId, tdoc.pids, true);
    const [rows, udict, nPages] = await RULES[tdoc.rule].scoreboard(
        isExport, this.translate.bind(this),
        tdoc, pdict, tsdocsCursor, page,
    );
    return [tdoc, rows, udict, pdict, nPages];
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
    add,
    getListStatus,
    getMultiStatus,
    attend,
    edit,
    del,
    get,
    getRelated,
    updateStatus,
    getStatus,
    count,
    getMulti,
    setStatus,
    getAndListStatus,
    recalcStatus,
    canShowRecord,
    canShowSelfRecord,
    canShowScoreboard,
    canViewHiddenScoreboard,
    getScoreboard,
    isNew,
    isUpcoming,
    isNotStarted,
    isOngoing,
    isDone,
    isExtended,
    statusText,
    getStatusText,
};
