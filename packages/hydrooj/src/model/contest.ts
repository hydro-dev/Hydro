import { sumBy } from 'lodash';
import { FilterQuery, ObjectID } from 'mongodb';
import { Counter, formatSeconds, Time } from '@hydrooj/utils/lib/utils';
import {
    ContestAlreadyAttendedError, ContestNotFoundError,
    ContestScoreboardHiddenError, ValidationError,
} from '../error';
import {
    BaseUserDict, ContestRule, ContestRules, ProblemDict,
    ScoreboardNode, ScoreboardRow, Tdoc,
} from '../interface';
import ranked from '../lib/rank';
import * as bus from '../service/bus';
import type { Handler } from '../service/server';
import { buildProjection } from '../utils';
import { PERM, STATUS } from './builtin';
import * as document from './document';
import problem from './problem';
import RecordModel from './record';
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
    npending?: number;
    penalty: number;
    real: number;
}

function buildContestRule<T>(def: ContestRule<T>): ContestRule<T> {
    const _originalRule = {
        scoreboard: def.scoreboard,
        scoreboardRow: def.scoreboardRow,
        scoreboardHeader: def.scoreboardHeader,
        stat: def.stat,
    };
    def.scoreboard = (def._originalRule?.scoreboard || def.scoreboard).bind(def);
    def.scoreboardHeader = (def._originalRule?.scoreboardHeader || def.scoreboardHeader).bind(def);
    def.scoreboardRow = (def._originalRule?.scoreboardRow || def.scoreboardRow).bind(def);
    def.stat = (def._originalRule?.stat || def.stat).bind(def);
    def._originalRule = _originalRule;
    return def;
}

const acm = buildContestRule({
    TEXT: 'ACM/ICPC',
    check: () => { },
    statusSort: { accept: -1, time: 1 },
    submitAfterAccept: false,
    showScoreboard: (tdoc, now) => now > tdoc.beginAt,
    showSelfRecord: () => true,
    showRecord: (tdoc, now) => now > tdoc.endAt,
    stat(tdoc, journal: AcmJournal[]) {
        const naccept = Counter<number>();
        const npending = Counter<number>();
        const effective: Record<number, AcmJournal> = {};
        const detail: Record<number, AcmDetail> = {};
        let accept = 0;
        let time = 0;
        for (const j of journal) {
            if (!this.submitAfterAccept && effective[j.pid]?.status === STATUS.STATUS_ACCEPTED) continue;
            if (j.status === STATUS.STATUS_WAITING) {
                npending[j.pid]++;
                continue;
            }
            effective[j.pid] = j;
            if (![STATUS.STATUS_ACCEPTED, STATUS.STATUS_COMPILE_ERROR, STATUS.STATUS_FORMAT_ERROR].includes(j.status)) {
                naccept[j.pid]++;
            }
        }
        for (const pid in effective) {
            const j = effective[pid];
            const real = Math.floor((j.rid.getTimestamp().getTime() - tdoc.beginAt.getTime()) / 1000);
            const penalty = 20 * 60 * naccept[j.pid];
            detail[pid] = {
                ...j, naccept: naccept[j.pid], time: real + penalty, real, penalty, npending: npending[j.pid],
            };
        }
        for (const d of Object.values(detail).filter((i) => i.status === STATUS.STATUS_ACCEPTED)) {
            accept++;
            time += d.time;
        }
        return { accept, time, detail };
    },
    async scoreboardHeader(isExport, _, tdoc, pdict) {
        const columns: ScoreboardRow = [
            { type: 'rank', value: '#' },
            { type: 'user', value: _('User') },
        ];
        if (isExport) {
            columns.push({ type: 'email', value: _('Email') });
            columns.push({ type: 'string', value: _('School') });
            columns.push({ type: 'string', value: _('Name') });
            columns.push({ type: 'string', value: _('Student ID') });
        }
        columns.push({ type: 'solved', value: `${_('Solved')}\n${_('Total Time')}` });
        for (let i = 1; i <= tdoc.pids.length; i++) {
            const pid = tdoc.pids[i - 1];
            pdict[pid].nAccept = pdict[pid].nSubmit = 0;
            if (isExport) {
                columns.push(
                    {
                        type: 'string',
                        value: '#{0} {1}'.format(i, pdict[pid].title),
                    },
                    {
                        type: 'time',
                        value: '#{0} {1}'.format(i, _('Penalty (Minutes)')),
                    },
                );
            } else {
                columns.push({
                    type: 'problem',
                    value: String.fromCharCode(65 + i - 1),
                    raw: pid,
                });
            }
        }
        return columns;
    },
    async scoreboardRow(isExport, _, tdoc, pdict, udoc, rank, tsdoc, meta) {
        const tsddict = tsdoc.detail || {};
        const row: ScoreboardRow = [
            { type: 'rank', value: rank ? rank.toString() : '*', raw: rank },
            { type: 'user', value: udoc.uname, raw: tsdoc.uid },
        ];
        if (isExport) {
            row.push({ type: 'email', value: udoc.mail });
            row.push({ type: 'string', value: udoc.school || '' });
            row.push({ type: 'string', value: udoc.displayName || '' });
            row.push({ type: 'string', value: udoc.studentId || '' });
        }
        row.push({
            type: 'time',
            value: `${tsdoc.accept || 0}\n${formatSeconds(tsdoc.time || 0.0, false)}`,
            hover: formatSeconds(tsdoc.time || 0.0),
        });
        for (const s of tsdoc.journal || []) {
            if (!pdict[s.pid]) continue;
            pdict[s.pid].nSubmit++;
            if (s.status === STATUS.STATUS_ACCEPTED) pdict[s.pid].nAccept++;
        }
        for (const pid of tdoc.pids) {
            const doc = tsddict[pid] || {} as Partial<AcmDetail>;
            const accept = doc.status === STATUS.STATUS_ACCEPTED;
            const colTime = accept ? formatSeconds(doc.real, false).toString() : '';
            const colPenalty = doc.rid ? Math.ceil(doc.penalty / 60).toString() : '';
            if (isExport) {
                row.push(
                    { type: 'string', value: colTime },
                    { type: 'string', value: colPenalty },
                );
            } else {
                let value = '';
                if (doc.rid) value = `-${doc.naccept}`;
                if (accept) value = `${doc.naccept ? `+${doc.naccept}` : '<span class="icon icon-check"></span>'}\n${colTime}`;
                else if (doc.npending) value += `${value ? ' ' : ''}<span style="color:orange">+${doc.npending}</span>`;
                row.push({
                    type: 'record',
                    score: accept ? 100 : 0,
                    value,
                    hover: accept ? formatSeconds(doc.time) : '',
                    raw: doc.rid,
                    style: accept && doc.rid.generationTime === meta?.first?.[pid]
                        ? 'background-color: rgb(217, 240, 199);'
                        : undefined,
                });
            }
        }
        return row;
    },
    async scoreboard(isExport, _, tdoc, pdict, cursor) {
        const rankedTsdocs = await ranked(cursor, (a, b) => a.score === b.score && a.time === b.time);
        const uids = rankedTsdocs.map(([, tsdoc]) => tsdoc.uid);
        const udict = await user.getListForRender(tdoc.domainId, uids);
        // Find first accept
        const first = {};
        const data = await document.collStatus.aggregate([
            {
                $match: {
                    domainId: tdoc.domainId,
                    docType: document.TYPE_CONTEST,
                    docId: tdoc.docId,
                    accept: { $gte: 1 },
                },
            },
            { $project: { r: { $objectToArray: '$detail' } } },
            { $unwind: '$r' },
            { $match: { 'r.v.status': STATUS.STATUS_ACCEPTED } },
            { $group: { _id: '$r.v.pid', first: { $min: '$r.v.rid' } } },
        ]).toArray() as any[];
        for (const t of data) first[t._id] = t.first.generationTime;

        const columns = await this.scoreboardHeader(isExport, _, tdoc, pdict);
        const rows: ScoreboardRow[] = [
            columns,
            ...await Promise.all(rankedTsdocs.map(
                ([rank, tsdoc]) => this.scoreboardRow(
                    isExport, _, tdoc, pdict, udict[tsdoc.uid], rank, tsdoc, { first },
                ),
            )),
        ];
        return [rows, udict];
    },
    async ranked(tdoc, cursor) {
        return await ranked(cursor, (a, b) => a.accept === b.accept && a.time === b.time);
    },
});

const oi = buildContestRule({
    TEXT: 'OI',
    check: () => { },
    submitAfterAccept: true,
    statusSort: { score: -1 },
    stat(tdoc, journal) {
        const detail = {};
        let score = 0;
        for (const j of journal.filter((i) => tdoc.pids.includes(i.pid))) {
            if (!detail[j.pid] || detail[j.pid].score < j.score || this.submitAfterAccept) detail[j.pid] = j;
        }
        for (const i in detail) score += detail[i].score;
        return { score, detail };
    },
    showScoreboard: (tdoc, now) => now > tdoc.endAt,
    showSelfRecord: (tdoc, now) => now > tdoc.endAt,
    showRecord: (tdoc, now) => now > tdoc.endAt,
    async scoreboardHeader(isExport, _, tdoc, pdict) {
        const columns: ScoreboardNode[] = [
            { type: 'rank', value: '#' },
            { type: 'user', value: _('User') },
        ];
        if (isExport) {
            columns.push({ type: 'email', value: _('Email') });
            columns.push({ type: 'string', value: _('School') });
            columns.push({ type: 'string', value: _('Name') });
            columns.push({ type: 'string', value: _('Student ID') });
        }
        columns.push({ type: 'total_score', value: _('Total Score') });
        for (let i = 1; i <= tdoc.pids.length; i++) {
            const pid = tdoc.pids[i - 1];
            pdict[pid].nAccept = pdict[pid].nSubmit = 0;
            if (isExport) {
                columns.push({
                    type: 'string',
                    value: '#{0} {1}'.format(i, pdict[tdoc.pids[i - 1]].title),
                });
            } else {
                columns.push({
                    type: 'problem',
                    value: String.fromCharCode(65 + i - 1),
                    raw: tdoc.pids[i - 1],
                });
            }
        }
        return columns;
    },
    async scoreboardRow(isExport, _, tdoc, pdict, udoc, rank, tsdoc, meta) {
        const tsddict = tsdoc.detail || {};
        const row: ScoreboardNode[] = [
            { type: 'rank', value: rank ? rank.toString() : '*', raw: rank },
            { type: 'user', value: udoc.uname, raw: tsdoc.uid },
        ];
        if (isExport) {
            row.push({ type: 'email', value: udoc.mail });
            row.push({ type: 'string', value: udoc.school || '' });
            row.push({ type: 'string', value: udoc.displayName || '' });
            row.push({ type: 'string', value: udoc.studentId || '' });
        }
        row.push({ type: 'total_score', value: tsdoc.score || 0 });
        for (const s of tsdoc.journal || []) {
            if (!pdict[s.pid]) continue;
            pdict[s.pid].nSubmit++;
            if (s.status === STATUS.STATUS_ACCEPTED) pdict[s.pid].nAccept++;
        }
        for (const pid of tdoc.pids) {
            const index = `${tsdoc.uid}/${tdoc.domainId}/${pid}`;
            // eslint-disable-next-line @typescript-eslint/no-use-before-define
            const node: ScoreboardNode = (!isExport && isDone(tdoc)
                && meta?.psdict?.[index]?.rid
                && tsddict[pid]?.rid?.toHexString() !== meta?.psdict?.[index]?.rid?.toHexString())
                ? {
                    type: 'records',
                    value: '',
                    raw: [{
                        value: tsddict[pid]?.score ?? '-',
                        raw: tsddict[pid]?.rid || null,
                    }, {
                        value: meta?.psdict?.[index]?.score ?? '-',
                        raw: meta?.psdict?.[index]?.rid ?? null,
                    }],
                } : {
                    type: 'record',
                    value: tsddict[pid]?.score ?? '-',
                    raw: tsddict[pid]?.rid || null,
                };
            if (tsddict[pid]?.status === STATUS.STATUS_ACCEPTED && tsddict[pid]?.rid.generationTime === meta?.first?.[pid]) {
                node.style = 'background-color: rgb(217, 240, 199);';
            }
            row.push(node);
        }
        return row;
    },
    async scoreboard(isExport, _, tdoc, pdict, cursor) {
        const rankedTsdocs = await ranked(cursor, (a, b) => a.score === b.score);
        const uids = rankedTsdocs.map(([, tsdoc]) => tsdoc.uid);
        const udict = await user.getListForRender(tdoc.domainId, uids);
        const psdict = {};
        const first = {};
        await Promise.all(tdoc.pids.map(async (pid) => {
            // eslint-disable-next-line @typescript-eslint/no-use-before-define
            const [data] = await getMultiStatus(tdoc.domainId, {
                docType: document.TYPE_CONTEST,
                docId: tdoc.docId,
                [`detail.${pid}.status`]: STATUS.STATUS_ACCEPTED,
            }).sort({ [`detail.${pid}.rid`]: 1 }).limit(1).toArray();
            first[pid] = data ? data.detail[pid].rid.generationTime : new ObjectID().generationTime;
        }));
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
        const columns = await this.scoreboardHeader(isExport, _, tdoc, pdict);
        const rows: ScoreboardRow[] = [
            columns,
            ...await Promise.all(rankedTsdocs.map(
                ([rank, tsdoc]) => this.scoreboardRow(
                    isExport, _, tdoc, pdict, udict[tsdoc.uid], rank, tsdoc, { psdict, first },
                ),
            )),
        ];
        return [rows, udict];
    },
    async ranked(tdoc, cursor) {
        return await ranked(cursor, (a, b) => a.score === b.score);
    },
});

const ioi = buildContestRule({
    ...oi,
    TEXT: 'IOI',
    submitAfterAccept: false,
    showRecord: (tdoc, now) => now > tdoc.endAt,
    showSelfRecord: () => true,
    showScoreboard: (tdoc, now) => now > tdoc.beginAt,
});

const homework = buildContestRule({
    TEXT: 'Assignment',
    hidden: true,
    check: () => { },
    submitAfterAccept: false,
    statusSort: { penaltyScore: -1, time: 1 },
    stat: (tdoc, journal) => {
        const effective = {};
        for (const j of journal) {
            if (tdoc.pids.includes(j.pid)) effective[j.pid] = j;
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
            effective[j].penaltyScore = penaltyScore(effective[j]);
            effective[j].time = time(effective[j]);
            detail.push(effective[j]);
        }
        return {
            score: sumBy(detail, 'score'),
            penaltyScore: sumBy(detail, 'penaltyScore'),
            time: Math.sum(detail.map((d) => d.time)),
            detail: effective,
        };
    },
    showScoreboard: () => true,
    showSelfRecord: () => true,
    showRecord: (tdoc, now) => now > tdoc.endAt,
    async scoreboardHeader(isExport, _, tdoc, pdict) {
        const columns: ScoreboardNode[] = [
            { type: 'rank', value: _('Rank') },
            { type: 'user', value: _('User') },
            { type: 'total_score', value: _('Score') },
        ];
        if (isExport) {
            columns.push({ type: 'string', value: _('Original Score') });
        }
        columns.push({ type: 'time', value: _('Total Time') });
        for (let i = 1; i <= tdoc.pids.length; i++) {
            const pid = tdoc.pids[i - 1];
            pdict[pid].nAccept = pdict[pid].nSubmit = 0;
            if (isExport) {
                columns.push(
                    {
                        type: 'string',
                        value: '#{0} {1}'.format(i, pdict[pid].title),
                    },
                    {
                        type: 'string',
                        value: '#{0} {1}'.format(i, _('Original Score')),
                    },
                    {
                        type: 'time',
                        value: '#{0} {1}'.format(i, _('Time (Seconds)')),
                    },
                );
            } else {
                columns.push({
                    type: 'problem',
                    value: String.fromCharCode(65 + i - 1),
                    raw: pid,
                });
            }
        }
        return columns;
    },
    async scoreboardRow(isExport, _, tdoc, pdict, udoc, rank, tsdoc) {
        const tsddict = tsdoc.detail || {};
        const row: ScoreboardRow = [
            { type: 'rank', value: rank.toString() },
            {
                type: 'user',
                value: udoc.uname,
                raw: tsdoc.uid,
            },
            {
                type: 'string',
                value: tsdoc.penaltyScore || 0,
            },
        ];
        if (isExport) {
            row.push({ type: 'string', value: tsdoc.score || 0 });
        }
        row.push({ type: 'time', value: formatSeconds(tsdoc.time || 0, false), raw: tsdoc.time });
        for (const s of tsdoc.journal || []) {
            if (!pdict[s.pid]) continue;
            pdict[s.pid].nSubmit++;
            if (s.status === STATUS.STATUS_ACCEPTED) pdict[s.pid].nAccept++;
        }
        for (const pid of tdoc.pids) {
            const rid = tsddict[pid]?.rid;
            const colScore = tsddict[pid]?.penaltyScore ?? '';
            const colOriginalScore = tsddict[pid]?.score ?? '';
            const colTime = tsddict[pid]?.time || '';
            const colTimeStr = colTime ? formatSeconds(colTime, false) : '';
            if (isExport) {
                row.push(
                    { type: 'string', value: colScore },
                    { type: 'string', value: colOriginalScore },
                    { type: 'time', value: colTime },
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
        return row;
    },
    async scoreboard(isExport, _, tdoc, pdict, cursor) {
        const rankedTsdocs = await ranked(cursor, (a, b) => a.score === b.score);
        const uids = rankedTsdocs.map(([, tsdoc]) => tsdoc.uid);
        const udict = await user.getListForRender(tdoc.domainId, uids);
        const columns = await this.scoreboardHeader(isExport, _, tdoc, pdict);
        const rows: ScoreboardRow[] = [
            columns,
            ...await Promise.all(rankedTsdocs.map(
                ([rank, tsdoc]) => this.scoreboardRow(isExport, _, tdoc, pdict, udict[tsdoc.uid], rank, tsdoc),
            )),
        ];
        return [rows, udict];
    },
    async ranked(tdoc, cursor) {
        return await ranked(cursor, (a, b) => a.score === b.score);
    },
});

export const RULES: ContestRules = {
    acm, oi, homework, ioi,
};

export enum AccessControl {
    FREE,
    LOCK_OTHER = 2,
    UNIQUE_LOGIN = 4,
    CLIENT_REQUIRED = 8,
}

function _getStatusJournal(tsdoc) {
    return tsdoc.journal.sort((a, b) => (a.rid.generationTime - b.rid.generationTime));
}

export async function add(
    domainId: string, title: string, content: string, owner: number,
    rule: string, beginAt = new Date(), endAt = new Date(), pids: number[] = [],
    rated = false, data: Partial<Tdoc<30>> = {},
) {
    if (!RULES[rule]) throw new ValidationError('rule');
    if (beginAt >= endAt) throw new ValidationError('beginAt', 'endAt');
    Object.assign(data, {
        content, owner, title, rule, beginAt, endAt, pids, attend: 0,
    });
    RULES[rule].check(data);
    await bus.parallel('contest/before-add', data);
    const res = await document.add(domainId, content, owner, document.TYPE_CONTEST, null, null, null, {
        ...data, title, rule, beginAt, endAt, pids, attend: 0, rated,
    });
    await bus.parallel('contest/add', data, res);
    return res;
}

export async function edit(domainId: string, tid: ObjectID, $set: Partial<Tdoc>) {
    if ($set.rule && !RULES[$set.rule]) throw new ValidationError('rule');
    const tdoc = await document.get(domainId, document.TYPE_CONTEST, tid);
    if (!tdoc) throw new ContestNotFoundError(domainId, tid);
    RULES[$set.rule || tdoc.rule].check(Object.assign(tdoc, $set));
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

export async function getRelated(domainId: string, pid: number, rule?: string) {
    const rules = Object.keys(RULES).filter((i) => !RULES[i].hidden);
    return await document.getMulti(domainId, document.TYPE_CONTEST, { pids: pid, rule: rule || { $in: rules } }).toArray();
}

export async function getStatus(domainId: string, tid: ObjectID, uid: number) {
    return await document.getStatus(domainId, document.TYPE_CONTEST, tid, uid);
}

async function _updateStatus(tdoc: Tdoc<30>, uid: number, rid: ObjectID, pid: number, status: STATUS, score: number) {
    // eslint-disable-next-line @typescript-eslint/no-use-before-define
    if (isLocked(tdoc)) {
        status = STATUS.STATUS_WAITING;
        score = 0;
    }
    const tsdoc = await document.revPushStatus(tdoc.domainId, document.TYPE_CONTEST, tdoc.docId, uid, 'journal', {
        rid, pid, status, score,
    }, 'rid');
    const journal = _getStatusJournal(tsdoc);
    const stats = RULES[tdoc.rule].stat(tdoc, journal);
    return await document.revSetStatus(tdoc.domainId, document.TYPE_CONTEST, tdoc.docId, uid, tsdoc.rev, { journal, ...stats });
}

export async function updateStatus(
    domainId: string, tid: ObjectID, uid: number, rid: ObjectID, pid: number,
    status = STATUS.STATUS_WRONG_ANSWER, score = 0,
) {
    const tdoc = await get(domainId, tid);
    return await _updateStatus(tdoc, uid, rid, pid, status, score);
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
    return (now < readyAt - days * Time.day);
}

export function isUpcoming(tdoc: Tdoc, days = 7) {
    const now = Date.now();
    const readyAt = tdoc.beginAt.getTime();
    return (now > readyAt - days * Time.day && now < readyAt);
}

export function isNotStarted(tdoc: Tdoc) {
    return (new Date()) < tdoc.beginAt;
}

export function isOngoing(tdoc: Tdoc, tsdoc?: any) {
    const now = new Date();
    if (tsdoc && tdoc.duration && tsdoc.startAt <= new Date(Date.now() - Math.floor(tdoc.duration * Time.hour))) return false;
    return (tdoc.beginAt <= now && now < tdoc.endAt);
}

export function isDone(tdoc: Tdoc, tsdoc?: any) {
    if (tdoc.endAt <= new Date()) return true;
    if (tsdoc && tdoc.duration && tsdoc.startAt <= new Date(Date.now() - Math.floor(tdoc.duration * Time.hour))) return true;
    return false;
}

export function isLocked(tdoc: Tdoc) {
    if (!tdoc.lockAt) return false;
    const now = new Date();
    return (tdoc.lockAt < now && now < tdoc.endAt);
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

export async function unlockScoreboard(domainId: string, tid: ObjectID) {
    const tdoc = await document.get(domainId, document.TYPE_CONTEST, tid);
    if (!tdoc.lockAt || tdoc.unlocked) return;
    const rdocs = await RecordModel.getMulti(domainId, { tid, _id: { $gte: Time.getObjectID(tdoc.lockAt) } })
        .project(buildProjection(['_id', 'uid', 'pid', 'status', 'score'])).toArray();
    await Promise.all(rdocs.map((rdoc) => _updateStatus(tdoc, rdoc.uid, rdoc._id, rdoc.pid, rdoc.status, rdoc.score)));
    await edit(domainId, tid, { unlocked: true });
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
    this: Handler, domainId: string, tid: ObjectID, isExport = false,
): Promise<[Tdoc<30>, ScoreboardRow[], BaseUserDict, ProblemDict]> {
    const tdoc = await get(domainId, tid);
    if (!canShowScoreboard.call(this, tdoc)) throw new ContestScoreboardHiddenError(tid);
    const tsdocsCursor = getMultiStatus(domainId, { docId: tid }).sort(RULES[tdoc.rule].statusSort);
    const pdict = await problem.getList(domainId, tdoc.pids, true, true, problem.PROJECTION_CONTEST_DETAIL);
    const [rows, udict] = await RULES[tdoc.rule].scoreboard(
        isExport, this.translate.bind(this),
        tdoc, pdict, tsdocsCursor,
    );
    await bus.parallel('contest/scoreboard', tdoc, rows, udict, pdict);
    return [tdoc, rows, udict, pdict];
}

export const statusText = (tdoc: Tdoc, tsdoc?: any) => (
    isNew(tdoc)
        ? 'New'
        : isUpcoming(tdoc)
            ? 'Ready (☆▽☆)'
            : isOngoing(tdoc, tsdoc)
                ? 'Live...'
                : 'Done');

global.Hydro.model.contest = {
    RULES,
    AccessControl,
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
    unlockScoreboard,
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
    isLocked,
    isExtended,
    statusText,
};
