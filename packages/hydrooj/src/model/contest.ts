import { sumBy } from 'lodash';
import { Filter, ObjectId } from 'mongodb';
import {
    Counter, formatSeconds, getAlphabeticId, Time,
} from '@hydrooj/utils/lib/utils';
import { Context } from '../context';
import {
    ContestAlreadyAttendedError, ContestNotFoundError,
    ContestScoreboardHiddenError, ValidationError,
} from '../error';
import {
    BaseUserDict, ContestJournalEntry, ContestPrintDoc, ContestRule, ContestRules,
    ContestStatusDoc, ProblemDict, RecordDoc, ScoreboardConfig, ScoreboardNode,
    ScoreboardRow, SubtaskResult, Tdoc,
} from '../interface';
import avatar from '../lib/avatar';
import bus from '../service/bus';
import db from '../service/db';
import type { Handler } from '../service/server';
import { Optional } from '../typeutils';
import { PERM, STATUS, STATUS_SHORT_TEXTS } from './builtin';
import * as document from './document';
import MessageModel from './message';
import problem, { ProblemModel } from './problem';
import RecordModel from './record';
import UserModel, { User } from './user';

export enum PrintTaskStatus {
    pending = 'pending',
    printing = 'printing',
    printed = 'printed',
    failed = 'failed',
}

interface AcmJournal {
    rid: ObjectId;
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

export function isNew(tdoc: Tdoc, days = 1) {
    const readyAt = tdoc.beginAt.getTime();
    return Date.now() < readyAt - days * Time.day;
}

export function isUpcoming(tdoc: Tdoc, days = 7) {
    const now = Date.now();
    const readyAt = tdoc.beginAt.getTime();
    return (now > readyAt - days * Time.day && now < readyAt);
}

export function isNotStarted(tdoc: Tdoc) {
    return (new Date()) < tdoc.beginAt;
}

export function isOngoing(tdoc: Tdoc, tsdoc?: ContestStatusDoc): boolean {
    const now = new Date();
    if (tsdoc?.endAt && tsdoc.endAt <= now) return false;
    if (tsdoc && tdoc.duration && tsdoc.startAt <= new Date(Date.now() - Math.floor(tdoc.duration * Time.hour))) return false;
    return (tdoc.beginAt <= now && now < tdoc.endAt);
}

export function isDone(tdoc: Tdoc, tsdoc?: ContestStatusDoc): boolean {
    if (tdoc.endAt <= new Date()) return true;
    if (tsdoc?.endAt && tsdoc.endAt <= new Date()) return true;
    if (tsdoc && tdoc.duration && tsdoc.startAt <= new Date(Date.now() - Math.floor(tdoc.duration * Time.hour))) return true;
    return false;
}

export function isLocked(tdoc: Tdoc, time = new Date()) {
    if (!tdoc.lockAt) return false;
    return (tdoc.rule === 'icpc_domjudge' ? tdoc.lockAt <= time : tdoc.lockAt < time) && !tdoc.unlocked;
}

export function isExtended(tdoc: Tdoc) {
    const now = Date.now();
    return tdoc.penaltySince.getTime() <= now && now < tdoc.endAt.getTime();
}

async function getScoreboardUdict(
    tdoc: Tdoc, rankedTsdocs: [number, ContestStatusDoc][], uids: number[], showDisplayName: boolean,
) {
    const memberUids = tdoc.allowTeam
        ? rankedTsdocs.flatMap(([, tsdoc]) => tsdoc.members || [])
        : [];
    const udict = await UserModel.getListForRender(tdoc.domainId, [...uids, ...memberUids], showDisplayName ? ['displayName'] : []);
    if (tdoc.allowTeam) {
        for (const [, tsdoc] of rankedTsdocs) {
            if (tsdoc.members?.length && udict[tsdoc.uid]) {
                (udict[tsdoc.uid] as any).teamMembers = tsdoc.members.filter((uid) => udict[uid]);
            }
        }
    }
    return udict;
}

export function buildContestRule<T>(def: Optional<ContestRule<T>, 'applyProjection'>): ContestRule<T>;
export function buildContestRule<T>(def: Partial<ContestRule<T>>, baseRule: ContestRule<T>): ContestRule<T>;
export function buildContestRule<T>(def: Partial<ContestRule<T>>, baseRule: ContestRule<T> = {} as any) {
    const base = baseRule._originalRule || { applyProjection: (_, rdoc) => rdoc };
    const funcs = ['scoreboard', 'scoreboardRow', 'scoreboardHeader', 'stat', 'applyProjection'];
    const f = {};
    const rule = { ...baseRule, ...def };
    for (const key of funcs) {
        f[key] = def[key] || base[key];
        rule[key] = f[key].bind(rule);
    }
    rule._originalRule = f;
    return rule;
}

const acm = buildContestRule({
    TEXT: 'XCPC',
    check: () => { },
    statusSort: { accept: -1, time: 1 },
    submitAfterAccept: false,
    showScoreboard: (tdoc, now) => now > tdoc.beginAt,
    showSelfRecord: () => true,
    showRecord: (tdoc, now) => now > tdoc.endAt && !isLocked(tdoc),
    stat(tdoc, journal: AcmJournal[]) {
        const naccept = Counter<number>();
        const npending = Counter<number>();
        const display: Record<number, AcmDetail> = {};
        const detail: Record<number, AcmDetail> = {};
        let accept = 0;
        let time = 0;
        const lockAt = isLocked(tdoc) ? tdoc.lockAt : null;
        for (const j of journal) {
            if (!tdoc.pids.includes(j.pid)) continue;
            if (!this.submitAfterAccept && display[j.pid]?.status === STATUS.STATUS_ACCEPTED) continue;
            if (![STATUS.STATUS_ACCEPTED, STATUS.STATUS_COMPILE_ERROR, STATUS.STATUS_FORMAT_ERROR, STATUS.STATUS_CANCELED].includes(j.status)) {
                naccept[j.pid]++;
            }
            const real = Math.floor((j.rid.getTimestamp().getTime() - tdoc.beginAt.getTime()) / 1000);
            const penalty = 20 * 60 * naccept[j.pid];
            detail[j.pid] = {
                ...j, naccept: naccept[j.pid], time: real + penalty, real, penalty,
            };
            if (lockAt && j.rid.getTimestamp() > lockAt) {
                npending[j.pid]++;
                // FIXME this is tricky
                // @ts-ignore
                display[j.pid] ||= {};
                display[j.pid].npending = npending[j.pid];
                continue;
            }
            display[j.pid] = detail[j.pid];
        }
        for (const d of Object.values(display).filter((i) => i.status === STATUS.STATUS_ACCEPTED)) {
            accept++;
            time += d.time;
        }
        return {
            accept, time, detail, display,
        };
    },
    async scoreboardHeader(config, _, tdoc, pdict) {
        const columns: ScoreboardRow = [
            { type: 'rank', value: '#' },
            { type: 'stu_class', value: _('Stu_Class') },
            { type: 'user', value: _('User') },
            { type: 'stu_stuid', value: _('Stu_Stuid') },
        ];
        if (config.isExport && config.showDisplayName) {
            columns.push({ type: 'email', value: _('Email') });
            columns.push({ type: 'string', value: _('Name') });
        }
        columns.push({ type: 'solved', value: `${_('Solved')}\n${_('Total Time')}` });
        for (let i = 1; i <= tdoc.pids.length; i++) {
            const pid = tdoc.pids[i - 1];
            pdict[pid].nAccept = pdict[pid].nSubmit = 0;
            if (config.isExport) {
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
                    value: getAlphabeticId(i - 1),
                    raw: pid,
                });
            }
        }
        return columns;
    },
    async scoreboardRow(config, _, tdoc, pdict, udoc, rank, tsdoc, meta) {
        const row: ScoreboardRow = [
            { type: 'rank', value: rank.toString() },
            { type: 'string', value: udoc.class || '' },
            { type: 'user', value: udoc.uname, raw: tsdoc.uid },
            { type: 'string', value: udoc.stuid || '' },
        ];
        if (config.isExport && config.showDisplayName) {
            row.push({ type: 'email', value: udoc.mail });
            row.push({ type: 'string', value: udoc.name || udoc.displayName || udoc.uname });
        }
        row.push({
            type: 'time',
            value: `${tsdoc.accept || 0}\n${formatSeconds(tsdoc.time || 0.0, false)}`,
            hover: formatSeconds(tsdoc.time || 0.0),
        });
        const accepted = {};
        for (const s of tsdoc.journal || []) {
            if (!pdict[s.pid]) continue;
            if (config.lockAt && s.rid.getTimestamp() > config.lockAt) continue;
            pdict[s.pid].nSubmit++;
            if (s.status === STATUS.STATUS_ACCEPTED && !accepted[s.pid]) {
                pdict[s.pid].nAccept++;
                accepted[s.pid] = true;
            }
        }
        const tsddict = (config.lockAt ? tsdoc.display : tsdoc.detail) || {};
        for (const pid of tdoc.pids) {
            const doc = tsddict[pid] || {} as Partial<AcmDetail>;
            const accept = doc.status === STATUS.STATUS_ACCEPTED;
            const colTime = accept ? formatSeconds(doc.real, false).toString() : '';
            const colPenalty = doc.rid ? Math.ceil(doc.penalty / 60).toString() : '';
            if (config.isExport) {
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
                    style: accept && doc.rid.getTimestamp().getTime() === meta?.first?.[pid]
                        ? 'background-color: rgb(217, 240, 199);'
                        : undefined,
                });
            }
        }
        return row;
    },
    async scoreboard(config, _, tdoc, pdict, cursor) {
        const rankedTsdocs = await db.ranked(cursor, (a, b) => (a.score || 0) === (b.score || 0) && (a.time || 0) === (b.time || 0));
        const uids = rankedTsdocs.map(([, tsdoc]) => tsdoc.uid);
        const udict = await getScoreboardUdict(tdoc, rankedTsdocs, uids, config.showDisplayName);
        // Find first accept
        const first = {};
        const data = await document.collStatus.aggregate([
            {
                $match: {
                    domainId: tdoc.domainId,
                    docType: document.TYPE_CONTEST,
                    docId: tdoc.docId,
                    accept: { $gte: 1 },
                    registrationCancelled: { $ne: true },
                },
            },
            { $project: { r: { $objectToArray: '$detail' } } },
            { $unwind: '$r' },
            { $match: { 'r.v.status': STATUS.STATUS_ACCEPTED } },
            { $group: { _id: '$r.v.pid', first: { $min: '$r.v.rid' } } },
        ]).toArray() as any[];
        for (const t of data) first[t._id] = t.first.getTimestamp().getTime();

        const columns = await this.scoreboardHeader(config, _, tdoc, pdict);
        const rows: ScoreboardRow[] = [
            columns,
            ...await Promise.all(rankedTsdocs.map(
                ([rank, tsdoc]) => this.scoreboardRow(
                    config, _, tdoc, pdict, udict[tsdoc.uid], rank, tsdoc, { first },
                ),
            )),
        ];
        return [rows, udict];
    },
    async ranked(tdoc, cursor) {
        return await db.ranked(cursor, (a, b) => a.accept === b.accept && a.time === b.time);
    },
    applyProjection(tdoc, rdoc) {
        if (isDone(tdoc)) return rdoc;
        delete rdoc.time;
        delete rdoc.memory;
        rdoc.testCases = [];
        rdoc.judgeTexts = [];
        delete rdoc.progress;
        delete rdoc.subtasks;
        delete rdoc.score;
        return rdoc;
    },
});

const oi = buildContestRule({
    TEXT: 'OI',
    check: () => { },
    submitAfterAccept: true,
    statusSort: { score: -1 },
    stat(tdoc, journal) {
        const npending = Counter();
        const detail = {};
        const display = {};
        let score = 0;

        const lockAt = isLocked(tdoc) ? tdoc.lockAt : null;
        for (const j of journal.filter((i) => tdoc.pids.includes(i.pid))) {
            if (lockAt && j.rid.getTimestamp() > lockAt) {
                npending[j.pid]++;
                display[j.pid] ||= {};
                display[j.pid].npending = npending[j.pid];
                continue;
            }
            if (!detail[j.pid] || detail[j.pid].score < j.score || this.submitAfterAccept) {
                detail[j.pid] = { ...j };
                display[j.pid] = { ...j };
            }
        }
        for (const i in display) {
            score += ((tdoc.score?.[i] || 100) * (display[i].score || 0)) / 100;
        }
        return { score, detail, display };
    },
    showScoreboard: (tdoc, now) => now > tdoc.endAt && !tdoc.keepScoreboardHidden,
    showSelfRecord: (tdoc, now) => now > tdoc.endAt && !tdoc.keepScoreboardHidden,
    showRecord: (tdoc, now) => now > tdoc.endAt && !tdoc.keepScoreboardHidden,
    async scoreboardHeader(config, _, tdoc, pdict) {
        const columns: ScoreboardNode[] = [
            { type: 'rank', value: '#' },
            { type: 'stu_class', value: _('Stu_Class') },
            { type: 'user', value: _('User') },
            { type: 'stu_stuid', value: _('Stu_Stuid') },
        ];
        if (config.isExport && config.showDisplayName) {
            columns.push({ type: 'email', value: _('Email') });
            columns.push({ type: 'string', value: _('Name') });
        }
        columns.push({ type: 'total_score', value: _('Total Score') });
        for (let i = 1; i <= tdoc.pids.length; i++) {
            const pid = tdoc.pids[i - 1];
            pdict[pid].nAccept = pdict[pid].nSubmit = 0;
            if (config.isExport) {
                columns.push({
                    type: 'string',
                    value: '#{0} {1}'.format(i, pdict[tdoc.pids[i - 1]].title),
                });
            } else {
                columns.push({
                    type: 'problem',
                    value: getAlphabeticId(i - 1),
                    raw: tdoc.pids[i - 1],
                });
            }
        }
        return columns;
    },
    async scoreboardRow(config, _, tdoc, pdict, udoc, rank, tsdoc, meta) {
        const row: ScoreboardNode[] = [
            { type: 'rank', value: rank.toString() },
            { type: 'string', value: udoc.class || '' },
            { type: 'user', value: udoc.uname, raw: tsdoc.uid },
            { type: 'string', value: udoc.stuid || '' },
        ];
        const displayScore = (pid: number, score?: number) => {
            if (typeof score !== 'number') return '-';
            return score * ((tdoc.score?.[pid] || 100) / 100);
        };
        if (config.isExport && config.showDisplayName) {
            row.push({ type: 'email', value: udoc.mail });
            row.push({ type: 'string', value: udoc.name || udoc.displayName || udoc.uname });
        }
        row.push({ type: 'total_score', value: (tsdoc.score || 0).toString() });
        const accepted = {};
        for (const s of tsdoc.journal || []) {
            if (!pdict[s.pid]) continue;
            if (config.lockAt && s.rid.getTimestamp() > config.lockAt) continue;
            pdict[s.pid].nSubmit++;
            if (s.status === STATUS.STATUS_ACCEPTED && !accepted[s.pid]) {
                pdict[s.pid].nAccept++;
                accepted[s.pid] = true;
            }
        }
        const tsddict = ((config.lockAt && isLocked(tdoc, new Date())) ? tsdoc.display : tsdoc.detail) || {};
        const useRelativeTime = !!tdoc.duration;
        for (const pid of tdoc.pids) {
            const index = `${tsdoc.uid}/${tdoc.domainId}/${pid}`;

            const node: ScoreboardNode = (!config.isExport && !config.lockAt && isDone(tdoc)
                && meta?.psdict?.[index]?.rid
                && tsddict[pid]?.rid?.toHexString() !== meta?.psdict?.[index]?.rid?.toHexString()
                && meta?.psdict?.[index]?.rid?.getTimestamp() > tdoc.endAt)
                ? {
                    type: 'records',
                    value: '',
                    raw: [{
                        value: displayScore(pid, tsddict[pid]?.score),
                        raw: tsddict[pid]?.rid || null,
                        score: tsddict[pid]?.score,
                    }, {
                        value: displayScore(pid, meta?.psdict?.[index]?.score),
                        raw: meta?.psdict?.[index]?.rid ?? null,
                        score: meta?.psdict?.[index]?.score,
                    }],
                } : {
                    type: 'record',
                    value: `${displayScore(pid, tsddict[pid]?.score)}${tsddict[pid]?.npending
                        ? `<span style="color:orange">+${tsddict[pid]?.npending}</span>` : ''}`,
                    raw: tsddict[pid]?.rid || null,
                    score: tsddict[pid]?.score,
                };
            if (tsddict[pid]?.status === STATUS.STATUS_ACCEPTED) {
                const startAt = (useRelativeTime ? tsdoc.startAt || tdoc.beginAt : tdoc.beginAt).getTime();
                if (tsddict[pid].rid.getTimestamp().getTime() - startAt === meta?.first?.[pid]) {
                    node.style = 'background-color: rgb(217, 240, 199);';
                }
            }
            row.push(node);
        }
        return row;
    },
    async scoreboard(config, _, tdoc, pdict, cursor) {
        const rankedTsdocs = await db.ranked(cursor, (a, b) => (a.score || 0) === (b.score || 0));
        const uids = rankedTsdocs.map(([, tsdoc]) => tsdoc.uid);
        const udict = await getScoreboardUdict(tdoc, rankedTsdocs, uids, config.showDisplayName);
        const psdict = {};
        const first = {};
        const useRelativeTime = !!tdoc.duration;
        for (const [, tsdoc] of rankedTsdocs) {
            for (const [pid, detail] of Object.entries(tsdoc.detail || {})) {
                if (detail.status !== STATUS.STATUS_ACCEPTED) continue;
                const time = detail.rid.getTimestamp().getTime() - (useRelativeTime ? tsdoc.startAt || tdoc.beginAt : tdoc.beginAt).getTime();
                if (!first[pid] || first[pid] > time) first[pid] = time;
            }
        }

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
        const columns = await this.scoreboardHeader(config, _, tdoc, pdict);
        const rows: ScoreboardRow[] = [
            columns,
            ...await Promise.all(rankedTsdocs.map(
                ([rank, tsdoc]) => this.scoreboardRow(
                    config, _, tdoc, pdict, udict[tsdoc.uid], rank, tsdoc, { psdict, first },
                ),
            )),
        ];
        return [rows, udict];
    },
    async ranked(tdoc, cursor) {
        return await db.ranked(cursor, (a, b) => a.score === b.score);
    },
    applyProjection(tdoc, rdoc) {
        if (isDone(tdoc)) return rdoc;
        delete rdoc.status;
        rdoc.compilerTexts = [];
        rdoc.judgeTexts = [];
        delete rdoc.memory;
        delete rdoc.time;
        delete rdoc.score;
        rdoc.testCases = [];
        delete rdoc.subtasks;
        return rdoc;
    },
});

const ioi = buildContestRule({
    TEXT: 'IOI',
    submitAfterAccept: false,

    showRecord: (tdoc, now) => now > tdoc.endAt && !isLocked(tdoc),
    showSelfRecord: () => true,
    showScoreboard: (tdoc, now) => now > tdoc.beginAt,
    applyProjection(_, rdoc) {
        return rdoc;
    },
}, oi);

const strictioi = buildContestRule({
    TEXT: 'IOI(Strict)',
    submitAfterAccept: false,
    showRecord: (tdoc, now) => now > tdoc.endAt && !tdoc.keepScoreboardHidden,
    showSelfRecord: (tdoc) => !tdoc.keepScoreboardHidden || !isDone(tdoc),
    showScoreboard: (tdoc, now) => now > tdoc.endAt && !tdoc.keepScoreboardHidden,
    stat(tdoc, journal) {
        const detail = {};
        let score = 0;
        const subtasks: Record<number, Record<number, SubtaskResult>> = {};
        for (const j of journal.filter((i) => tdoc.pids.includes(i.pid))) {
            subtasks[j.pid] ||= {};
            for (const i in j.subtasks) {
                if (!subtasks[j.pid][i] || subtasks[j.pid][i].score < j.subtasks[i].score) subtasks[j.pid][i] = j.subtasks[i];
            }
            j.score = sumBy(Object.values(subtasks[j.pid]), 'score');
            j.status = Math.max(...Object.values(subtasks[j.pid]).map((i) => i.status));
            if (!detail[j.pid] || detail[j.pid].score < j.score) detail[j.pid] = { ...j, subtasks: subtasks[j.pid] };
        }
        for (const i in detail) score += ((tdoc.score?.[i] || 100) * (detail[i].score || 0)) / 100;
        return { score, detail };
    },
    async scoreboardRow(config, _, tdoc, pdict, udoc, rank, tsdoc, meta) {
        const tsddict = tsdoc.detail || {};
        const row: ScoreboardNode[] = [
            { type: 'rank', value: rank.toString() },
            { type: 'string', value: udoc.class || '' },
            { type: 'user', value: udoc.uname, raw: tsdoc.uid },
            { type: 'string', value: udoc.stuid || '' },
        ];
        if (config.isExport && config.showDisplayName) {
            row.push({ type: 'email', value: udoc.mail });
            row.push({ type: 'string', value: udoc.name || udoc.displayName || udoc.uname });
        }
        row.push({ type: 'total_score', value: (tsdoc.score || 0).toString() });
        const accepted = {};
        for (const s of tsdoc.journal || []) {
            if (!pdict[s.pid]) continue;
            pdict[s.pid].nSubmit++;
            if (s.status === STATUS.STATUS_ACCEPTED && !accepted[s.pid]) {
                pdict[s.pid].nAccept++;
                accepted[s.pid] = true;
            }
        }
        for (const pid of tdoc.pids) {
            const index = `${tsdoc.uid}/${tdoc.domainId}/${pid}`;
            const n: ScoreboardNode = (!config.isExport && !config.lockAt && isDone(tdoc)
                && meta?.psdict?.[index]?.rid
                && tsddict[pid]?.rid?.toHexString() !== meta?.psdict?.[index]?.rid?.toHexString()
                && meta?.psdict?.[index]?.rid?.getTimestamp() > tdoc.endAt)
                ? {
                    type: 'records',
                    value: '',
                    raw: [{
                        value: ((tsddict[pid]?.score || 0) * ((tdoc.score?.[pid] || 100) / 100)).toString() || '',
                        raw: tsddict[pid]?.rid || null,
                        score: tsddict[pid]?.score,
                    }, {
                        value: ((meta?.psdict?.[index]?.score || 0) * ((tdoc.score?.[pid] || 100) / 100)).toString() || '',
                        raw: meta?.psdict?.[index]?.rid ?? null,
                        score: meta?.psdict?.[index]?.score,
                    }],
                } : {
                    type: 'record',
                    value: ((tsddict[pid]?.score || 0) * ((tdoc.score?.[pid] || 100) / 100)).toString() || '',
                    raw: tsddict[pid]?.rid,
                    score: tsddict[pid]?.score,
                };
            n.hover = Object.values(tsddict[pid]?.subtasks || {}).map((i: SubtaskResult) => `${STATUS_SHORT_TEXTS[i.status]} ${i.score}`).join(',');
            if (tsddict[pid]?.status === STATUS.STATUS_ACCEPTED
                && tsddict[pid].rid.getTimestamp().getTime() - (tsdoc.startAt || tdoc.beginAt).getTime() === meta?.first?.[pid]) {
                n.style = 'background-color: rgb(217, 240, 199);';
            }
            row.push(n);
        }
        return row;
    },
}, ioi);

const ledo = buildContestRule({
    TEXT: 'Ledo',
    check: () => { },
    submitAfterAccept: false,
    showScoreboard: (tdoc, now) => now > tdoc.beginAt,
    showSelfRecord: () => true,
    showRecord: (tdoc, now) => now > tdoc.endAt,
    stat(tdoc, journal) {
        const ntry = Counter<number>();
        const detail = {};
        for (const j of journal.filter((i) => tdoc.pids.includes(i.pid))) {
            const vaild = ![STATUS.STATUS_COMPILE_ERROR, STATUS.STATUS_FORMAT_ERROR].includes(j.status);
            if (vaild) ntry[j.pid]++;
            const penaltyScore = vaild ? Math.round(Math.max(0.7, 0.95 ** (ntry[j.pid] - 1)) * j.score) : 0;
            if (!detail[j.pid] || detail[j.pid].penaltyScore < penaltyScore) {
                detail[j.pid] = {
                    ...j,
                    penaltyScore,
                    ntry: Math.max(0, ntry[j.pid] - 1),
                };
            }
        }
        let score = 0;
        let originalScore = 0;
        for (const pid of tdoc.pids) {
            if (!detail[pid]) continue;
            const rate = (tdoc.score?.[pid] || 100) / 100;
            score += detail[pid].penaltyScore * rate;
            originalScore += detail[pid].score * rate;
        }
        return {
            score, originalScore, detail,
        };
    },
    async scoreboardRow(config, _, tdoc, pdict, udoc, rank, tsdoc, meta) {
        const tsddict = tsdoc.detail || {};
        const row: ScoreboardRow = [
            { type: 'rank', value: rank.toString() },
            { type: 'string', value: udoc.class || '' },
            { type: 'user', value: udoc.uname, raw: tsdoc.uid },
            { type: 'string', value: udoc.stuid || '' },
        ];
        if (config.isExport && config.showDisplayName) {
            row.push({ type: 'email', value: udoc.mail });
            row.push({ type: 'string', value: udoc.name || udoc.displayName || udoc.uname });
        }
        row.push({
            type: 'total_score',
            value: (tsdoc.score || 0).toString(),
            hover: tsdoc.score !== tsdoc.originalScore ? _('Original score: {0}').format(tsdoc.originalScore) : '',
        });
        const accepted = {};
        for (const s of tsdoc.journal || []) {
            if (!pdict[s.pid]) continue;
            pdict[s.pid].nSubmit++;
            if (s.status === STATUS.STATUS_ACCEPTED && !accepted[s.pid]) {
                pdict[s.pid].nAccept++;
                accepted[s.pid] = true;
            }
        }
        for (const pid of tdoc.pids) {
            row.push({
                type: 'record',
                value: ((tsddict[pid]?.penaltyScore || 0) * ((tdoc.score?.[pid] || 100) / 100)).toString(),
                hover: tsddict[pid]?.ntry ? `-${tsddict[pid].ntry} (${Math.round(Math.max(0.7, 0.95 ** tsddict[pid].ntry) * 100)}%)` : '',
                raw: tsddict[pid]?.rid,
                score: tsddict[pid]?.score,
                style: tsddict[pid]?.status === STATUS.STATUS_ACCEPTED
                    && tsddict[pid].rid.getTimestamp().getTime() - (tsdoc.startAt || tdoc.beginAt).getTime() === meta?.first?.[pid]
                    ? 'background-color: rgb(217, 240, 199);'
                    : undefined,
            });
        }
        return row;
    },
    applyProjection(_, rdoc) {
        return rdoc;
    },
}, oi);

const homework = buildContestRule({
    TEXT: 'Assignment',
    hidden: true,
    features: ['scoreboard', 'download'],
    check: () => { },
    submitAfterAccept: false,
    statusSort: { penaltyScore: -1, time: 1 },
    stat: (tdoc, journal) => {
        const effective = {};
        for (const j of journal) {
            if (tdoc.pids.includes(j.pid)) effective[j.pid] = j;
        }
        function time(jdoc) {
            const real = (jdoc.rid.getTimestamp().getTime() - tdoc.beginAt.getTime()) / 1000;
            return Math.floor(real);
        }

        function penaltyScore(jdoc) {
            const rate = (tdoc.score?.[jdoc.pid] || 100) / 100;
            const exceedSeconds = Math.floor(
                (jdoc.rid.getTimestamp().getTime() - tdoc.penaltySince.getTime()) / 1000,
            );
            if (exceedSeconds < 0) return rate * jdoc.score;
            let coefficient = 1;
            const keys = Object.keys(tdoc.penaltyRules).map(Number.parseFloat).sort((a, b) => a - b);
            for (const i of keys) {
                if (i * 3600 <= exceedSeconds) coefficient = tdoc.penaltyRules[i];
                else break;
            }
            return rate * jdoc.score * coefficient;
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
    async scoreboardHeader(config, _, tdoc, pdict) {
        const columns: ScoreboardNode[] = [
            { type: 'rank', value: _('Rank') },
            { type: 'stu_class', value: _('Stu_Class') },
            { type: 'user', value: _('User') },
            { type: 'total_score', value: _('Score') },
        ];
        if (config.isExport) {
            columns.push(
                { type: 'string', value: _('Original Score') },
                { type: 'stu_name', value: _('Stu_Name') },
                { type: 'stu_stuid', value: _('Stu_Stuid') });
        }
        for (let i = 1; i <= tdoc.pids.length; i++) {
            const pid = tdoc.pids[i - 1];
            pdict[pid].nAccept = pdict[pid].nSubmit = 0;
            if (config.isExport) {
                columns.push(
                    {
                        type: 'string',
                        value: '#{0} {1}'.format(i, pdict[pid].title),
                    },
                    {
                        type: 'string',
                        value: '#{0} {1}'.format(i, _('Original Score')),
                    },
                );
            } else {
                columns.push({
                    type: 'problem',
                    value: getAlphabeticId(i - 1),
                    raw: pid,
                });
            }
        }
        return columns;
    },
    async scoreboardRow(config, _, tdoc, pdict, udoc, rank, tsdoc) {
        const tsddict = tsdoc.detail || {};
        const row: ScoreboardRow = [
            { type: 'rank', value: rank.toString() },
            {
                type: 'string',
                value: udoc.class || '',
            },
            {
                type: 'user',
                value: udoc.uname,
                raw: tsdoc.uid,
            },
            {
                type: 'string',
                value: (tsdoc.score || 0).toString(),
            },
        ];
        if (config.isExport) {
            row.push(
                { type: 'string', value: (tsdoc.score || 0).toString() },
                { type: 'string', value: udoc.name || udoc.uname },
                { type: 'string', value: udoc.stuid || '' });
        }
        const accepted = {};
        for (const s of tsdoc.journal || []) {
            if (!pdict[s.pid]) continue;
            pdict[s.pid].nSubmit++;
            if (s.status === STATUS.STATUS_ACCEPTED && !accepted[s.pid]) {
                pdict[s.pid].nAccept++;
                accepted[s.pid] = true;
            }
        }
        for (const pid of tdoc.pids) {
            const rid = tsddict[pid]?.rid;
            const colScore = (tsddict[pid]?.penaltyScore ?? '').toString();
            const colOriginalScore = (tsddict[pid]?.score ?? '').toString();
            if (config.isExport) {
                row.push(
                    { type: 'string', value: colScore },
                    { type: 'string', value: colOriginalScore },
                );
            } else {
                row.push({
                    type: 'record',
                    score: tsddict[pid]?.score,
                    value: colScore === colOriginalScore
                        ? '{0}'.format(colScore)
                        : '{0} / {1}'.format(colScore, colOriginalScore),
                    raw: rid,
                });
            }
        }
        return row;
    },
    async scoreboard(config, _, tdoc, pdict, cursor) {
        const rankedTsdocs = await db.ranked(cursor, (a, b) => a.score === b.score);
        const uids = rankedTsdocs.map(([, tsdoc]) => tsdoc.uid);
        const udict = await getScoreboardUdict(tdoc, rankedTsdocs, uids, config.showDisplayName);
        const columns = await this.scoreboardHeader(config, _, tdoc, pdict);
        const rows: ScoreboardRow[] = [
            columns,
            ...await Promise.all(rankedTsdocs.map(
                ([rank, tsdoc]) => this.scoreboardRow(config, _, tdoc, pdict, udict[tsdoc.uid], rank, tsdoc),
            )),
        ];
        return [rows, udict];
    },
    async ranked(tdoc, cursor) {
        return await db.ranked(cursor, (a, b) => a.score === b.score);
    },
});

export const RULES: ContestRules = {
    acm, oi, homework, ioi, ledo, strictioi,
};

const collBalloon = db.collection('contest.balloon');

function _getStatusJournal(tsdoc: ContestStatusDoc): ContestJournalEntry[] {
    return tsdoc.journal!.sort((a, b) => (a.rid.getTimestamp().getTime() - b.rid.getTimestamp().getTime()));
}

export async function add(
    domainId: string, title: string, content: string, owner: number,
    rule: string, beginAt = new Date(), endAt = new Date(), pids: number[] = [],
    rated = false, data: Partial<Tdoc> = {},
) {
    if (!RULES[rule]) throw new ValidationError('rule');
    if (beginAt >= endAt) throw new ValidationError('beginAt', 'endAt');
    Object.assign(data, {
        content, owner, title, rule, beginAt, endAt, pids, attend: 0,
    });
    RULES[rule].check(data);
    await bus.parallel('contest/before-add', data);
    const docId = await document.add(domainId, content, owner, document.TYPE_CONTEST, null, null, null, {
        assign: [], ...data, title, rule, beginAt, endAt, pids, attend: 0, rated,
    });
    await bus.parallel('contest/add', data, docId);
    return docId;
}

export async function edit(domainId: string, tid: ObjectId, $set: Partial<Tdoc>) {
    if ($set.rule && !RULES[$set.rule]) throw new ValidationError('rule');
    const tdoc = await document.get(domainId, document.TYPE_CONTEST, tid);
    if (!tdoc) throw new ContestNotFoundError(domainId, tid);
    await bus.parallel('contest/before-edit', tdoc, $set);
    RULES[$set.rule || tdoc.rule].check(Object.assign(tdoc, $set));
    const res = await document.set(domainId, document.TYPE_CONTEST, tid, $set);
    await bus.parallel('contest/edit', res);
    return res;
}

export async function del(domainId: string, tid: ObjectId) {
    await Promise.all([
        bus.parallel('contest/del', domainId, tid),
        document.deleteOne(domainId, document.TYPE_CONTEST, tid),
        document.deleteMultiStatus(domainId, document.TYPE_CONTEST, { docId: tid }),
    ]);
}

export async function get(domainId: string, tid: ObjectId): Promise<Tdoc> {
    const tdoc = await document.get(domainId, document.TYPE_CONTEST, tid);
    if (!tdoc) throw new ContestNotFoundError(domainId, tid);
    return tdoc;
}

export async function getRelated(domainId: string, pid: number, rule?: string) {
    const rules = Object.keys(RULES).filter((i) => !RULES[i].hidden);
    return await document.getMulti(domainId, document.TYPE_CONTEST, { pids: pid, rule: rule || { $in: rules } }).toArray();
}

async function refreshFirstBalloon(domainId: string, tid: ObjectId, pid: number) {
    const tdoc = await get(domainId, tid);
    const scope: any = { contest: tid, pid };
    if (tdoc.rule === 'icpc_domjudge') {
        scope._id = { $gte: ObjectId.createFromTime(Math.ceil(+tdoc.beginAt / 1000)),
            $lt: ObjectId.createFromTime(Math.ceil(+tdoc.endAt / 1000)) };
    }
    const accepted = await RecordModel.getMulti(domainId, { ...scope, status: STATUS.STATUS_ACCEPTED })
        .sort({ _id: 1 }).project({ _id: 1, uid: 1 }).limit(1).next();
    if (!accepted) {
        await collBalloon.updateMany({ domainId, tid, pid, first: true }, { $unset: { first: '' } });
        return;
    }
    const pending = await RecordModel.getMulti(domainId, { ...scope, _id: { ...scope._id, $lt: accepted._id },
        status: { $in: [STATUS.STATUS_WAITING, STATUS.STATUS_COMPILING, STATUS.STATUS_JUDGING, STATUS.STATUS_FETCHED] } })
        .project({ _id: 1 }).limit(1).next();
    // An older pending record must never hold up a completed judgement. Its final callback resolves first blood.
    if (pending) return;
    // eslint-disable-next-line ts/no-use-before-define -- Ownership lookups are grouped with the roster helpers below.
    const uid = await getRecordParticipant(domainId, tid, accepted.uid, accepted._id);
    const winner = await collBalloon.findOne({ domainId, tid, pid, uid });
    if (!winner) return;
    await collBalloon.updateMany({ domainId, tid, pid, first: true, _id: { $ne: winner._id } }, { $unset: { first: '' } });
    try {
        const result = await collBalloon.updateOne({ domainId, tid, _id: winner._id, first: { $ne: true } }, { $set: { first: true } });
        if (result.modifiedCount) bus.emit('contest/balloon', domainId, tid, { ...winner, first: true });
    } catch (error) {
        if (error.code !== 11000) throw error;
    }
}

export async function addBalloon(domainId: string, tid: ObjectId, uid: number, rid: ObjectId, pid: number) {
    if (await collBalloon.findOne({ domainId, tid, pid, uid })) {
        await refreshFirstBalloon(domainId, tid, pid);
        return null;
    }
    const newBdoc = { _id: rid, domainId, tid, pid, uid, createdAt: new Date() };
    try {
        await collBalloon.insertOne(newBdoc);
    } catch (error) {
        if (error.code !== 11000) throw error;
        // Simultaneous AC/rejudge callbacks must not abort the contest journal update.
        if (!await collBalloon.findOne({ domainId, tid, pid, uid })) throw error;
        await refreshFirstBalloon(domainId, tid, pid);
        return null;
    }
    bus.emit('contest/balloon', domainId, tid, newBdoc);
    await refreshFirstBalloon(domainId, tid, pid);
    return rid;
}

export async function getBalloon(domainId: string, tid: ObjectId, _id: ObjectId) {
    return await collBalloon.findOne({ domainId, tid, _id });
}

export function getMultiBalloon(domainId: string, tid: ObjectId, query: any = {}) {
    return collBalloon.find({ domainId, tid, ...query });
}

export async function updateBalloon(domainId: string, tid: ObjectId, _id: ObjectId, $set: any) {
    return await collBalloon.findOneAndUpdate({ domainId, tid, _id }, { $set });
}

/** Idempotent delivery: a concurrent click cannot overwrite the original courier or timestamp. */
export async function setBalloonDelivery(domainId: string, tid: ObjectId, _id: ObjectId, sender: number | null) {
    if (sender !== null && (!Number.isSafeInteger(sender) || sender <= 0)) throw new ValidationError('sender');
    // false/0 were used by old integrations and both mean not yet delivered.
    const pending: any = { domainId, tid, _id, sent: { $in: [null, false, 0] } };
    const previous = sender === null
        ? await collBalloon.findOneAndUpdate({ domainId, tid, _id }, { $unset: { sent: '', sentAt: '' } })
        : await collBalloon.findOneAndUpdate(pending, { $set: { sent: sender, sentAt: new Date() } });
    if (previous && (sender !== null || previous.sent)) await bus.parallel('contest/balloon-delivery', domainId, tid, _id, sender);
    return previous;
}

export async function getStatus(domainId: string, tid: ObjectId, uid: number) {
    return await document.getStatus(domainId, document.TYPE_CONTEST, tid, uid);
}

export function getMultiStatus(domainId: string, query: any) {
    return document.getMultiStatus(domainId, document.TYPE_CONTEST, { registrationCancelled: { $ne: true }, ...query });
}

export async function getTeamVid(domainId: string, tid: ObjectId, uid: number): Promise<number | null> {
    const s = await getMultiStatus(domainId, { docId: tid, members: uid }).project({ uid: 1 }).limit(1).next();
    return s?.uid ?? null;
}

export async function getRecordParticipant(domainId: string, tid: ObjectId, uid: number, rid: ObjectId): Promise<number> {
    // The recorded entry remains authoritative after cancellation or roster changes.
    const previous = await document.getMultiStatus(domainId, document.TYPE_CONTEST, {
        docId: tid, 'journal.rid': rid,
    }).project({ uid: 1 }).limit(1).next();
    return previous?.uid ?? await getTeamVid(domainId, tid, uid) ?? uid;
}

/** Preserve submission ownership when a member changes teams after cancellation. */
export async function getParticipantRecordQuery(tdoc: Tdoc, participant: number, members?: number[]): Promise<Filter<RecordDoc>> {
    const accounts = members?.length ? members : [participant];
    const query: Filter<RecordDoc> = { contest: tdoc.docId, uid: accounts.length === 1 ? accounts[0] : { $in: accounts } };
    if (tdoc.rule !== 'icpc_domjudge') return query;
    const previous = await document.getMultiStatus(tdoc.domainId, document.TYPE_CONTEST, {
        docId: tdoc.docId, uid: { $ne: participant },
        $or: [{ uid: { $in: accounts } }, { members: { $in: accounts } },
            { uid: { $lt: 0 }, members: null }, { uid: { $lt: 0 }, members: { $size: 0 } }],
    }).project({ 'journal.rid': 1 }).toArray();
    const foreign = previous.flatMap((row) => (row.journal || []).map((entry) => entry.rid));
    if (foreign.length) query._id = { $nin: foreign };
    return query;
}

export async function updateStatus(
    domainId: string, tid: ObjectId, uid: number, rid: ObjectId, pid: number,
    {
        status = STATUS.STATUS_WAITING,
        score = 0,
        subtasks,
        lang,
    }: { status?: STATUS, score?: number, subtasks?: Record<number, SubtaskResult>, lang?: string } = {},
) {
    const tdoc = await get(domainId, tid);
    const onsite = tdoc.rule === 'icpc_domjudge';
    const submittedAt = +rid.getTimestamp();
    const inWindow = !onsite || (tdoc.pids.includes(pid) && submittedAt >= +tdoc.beginAt && submittedAt < +tdoc.endAt);
    // A pre-freeze submission can finish judging after the public scoreboard freezes.
    const balloonVisible = !isLocked(tdoc) || (onsite && submittedAt < +tdoc.lockAt);
    if (tdoc.balloon?.[pid] && !tdoc.balloonDisabled && inWindow && balloonVisible && status === STATUS.STATUS_ACCEPTED
        && !(await getStatus(domainId, tid, uid))?.registrationCancelled) await addBalloon(domainId, tid, uid, rid, pid);
    const tsdoc = await document.revPushStatus(tdoc.domainId, document.TYPE_CONTEST, tdoc.docId, uid, 'journal', {
        rid, pid, status, score, subtasks, lang,
    }, 'rid');
    const journal = _getStatusJournal(tsdoc);
    const stats = RULES[tdoc.rule].stat(tdoc, journal);
    const updated = await document.revSetStatus(tdoc.domainId, document.TYPE_CONTEST, tdoc.docId, uid, tsdoc.rev, { journal, ...stats });
    if (tdoc.balloon?.[pid] && !tdoc.balloonDisabled && status !== STATUS.STATUS_ACCEPTED
        && ![STATUS.STATUS_WAITING, STATUS.STATUS_COMPILING, STATUS.STATUS_JUDGING, STATUS.STATUS_FETCHED].includes(status)) {
        await refreshFirstBalloon(domainId, tid, pid);
    }
    return updated;
}

export async function getListStatus(domainId: string, uid: number, tids: ObjectId[]) {
    const r = {};
    for (const tid of tids) {
        // eslint-disable-next-line no-await-in-loop
        const tsdoc = await getStatus(domainId, tid, uid);
        if (tsdoc?.attend) {
            r[tid.toHexString()] = tsdoc;
            continue;
        }
        // eslint-disable-next-line no-await-in-loop
        const teamVid = await getTeamVid(domainId, tid, uid);
        // eslint-disable-next-line no-await-in-loop
        r[tid.toHexString()] = teamVid ? await getStatus(domainId, tid, teamVid) : tsdoc;
    }
    return r;
}

export async function attend(domainId: string, tid: ObjectId, uid: number, payload: any = {}) {
    try {
        await document.cappedIncStatus(domainId, document.TYPE_CONTEST, tid, uid, 'attend', 1, 0, 1, { ...payload, registrationCancelled: false });
    } catch (e) {
        throw new ContestAlreadyAttendedError(tid, uid);
    }
    await document.inc(domainId, document.TYPE_CONTEST, tid, 'attend', 1);
    return {};
}

export async function cancelAttend(domainId: string, tid: ObjectId, uid: number) {
    await document.deleteMultiStatus(domainId, document.TYPE_CONTEST, { docId: tid, uid });
    await document.inc(domainId, document.TYPE_CONTEST, tid, 'attend', -1);
    return {};
}

export function setStatus(domainId: string, tid: ObjectId, uid: number, $set?: any, $unset?: any) {
    return document.setStatus(domainId, document.TYPE_CONTEST, tid, uid, $set, $unset);
}

export function count(domainId: string, query: any) {
    return document.count(domainId, document.TYPE_CONTEST, query);
}

export function countStatus(domainId: string, query: any) {
    return document.countStatus(domainId, document.TYPE_CONTEST, query);
}

export function getMulti(
    domainId: string, query: Filter<document.DocType['30']> = {},
) {
    return document.getMulti(domainId, document.TYPE_CONTEST, query).sort({ beginAt: -1 });
}

export async function getAndListStatus(domainId: string, tid: ObjectId): Promise<[Tdoc, any[]]> {
    // TODO(iceboy): projection, pagination.
    const tdoc = await get(domainId, tid);
    const tsdocs = await getMultiStatus(domainId, { docId: tid })
        .sort(RULES[tdoc.rule].statusSort).toArray();
    return [tdoc, tsdocs];
}

export async function recalcStatus(domainId: string, tid: ObjectId) {
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

export async function unlockScoreboard(domainId: string, tid: ObjectId) {
    const tdoc = await document.get(domainId, document.TYPE_CONTEST, tid);
    if (!tdoc.lockAt || tdoc.unlocked) return;
    await edit(domainId, tid, { unlocked: true });
    await recalcStatus(domainId, tid);
}

export async function isSameTeam(domainId: string, tid: ObjectId, a: number, b: number): Promise<boolean> {
    if (a === b) return true;
    const [va, vb] = await Promise.all([getTeamVid(domainId, tid, a), getTeamVid(domainId, tid, b)]);
    return !!va && va === vb;
}

export async function isOwnOrTeammateRecord(domainId: string, rdoc: RecordDoc, uid: number): Promise<boolean> {
    if (rdoc.uid === uid) return true;
    if (!rdoc.contest) return false;
    if (RecordModel.RECORD_PRETEST.equals(rdoc.contest) || RecordModel.RECORD_GENERATE.equals(rdoc.contest)) return false;
    const tdoc = await get(domainId, rdoc.contest);
    if (tdoc.rule === 'icpc_domjudge') {
        const owner = await getRecordParticipant(domainId, rdoc.contest, rdoc.uid, rdoc._id);
        const status = await getStatus(domainId, rdoc.contest, owner);
        return !!status?.members?.includes(uid);
    }
    return isSameTeam(domainId, rdoc.contest, rdoc.uid, uid);
}

export function canViewHiddenScoreboard(this: { user: User }, tdoc: Tdoc) {
    if (this.user.own(tdoc)) return true;
    if (tdoc.rule === 'homework') return this.user.hasPerm(PERM.PERM_VIEW_HOMEWORK_HIDDEN_SCOREBOARD);
    return this.user.hasPerm(PERM.PERM_VIEW_CONTEST_HIDDEN_SCOREBOARD);
}

export function canShowRecord(this: { user: User }, tdoc: Tdoc, allowPermOverride = true) {
    if (RULES[tdoc.rule].showRecord(tdoc, new Date())) return true;
    if (allowPermOverride && canViewHiddenScoreboard.call(this, tdoc)) return true;
    return false;
}

export function canShowSelfRecord(this: { user: User }, tdoc: Tdoc, allowPermOverride = true) {
    if (RULES[tdoc.rule].showSelfRecord(tdoc, new Date())) return true;
    if (allowPermOverride && canViewHiddenScoreboard.call(this, tdoc)) return true;
    return false;
}

export function canShowScoreboard(this: { user: User }, tdoc: Tdoc, allowPermOverride = true) {
    if (RULES[tdoc.rule].showScoreboard(tdoc, new Date())) return true;
    if (allowPermOverride && canViewHiddenScoreboard.call(this, tdoc)) return true;
    return false;
}

export async function getScoreboard(
    this: Handler, domainId: string, tid: ObjectId, config: ScoreboardConfig,
): Promise<[Tdoc, ScoreboardRow[], BaseUserDict, ProblemDict]> {
    const tdoc = await get(domainId, tid);
    if (!canShowScoreboard.call(this, tdoc)) throw new ContestScoreboardHiddenError(tid);
    const tsdocsCursor = getMultiStatus(domainId, { docId: tid }).sort(RULES[tdoc.rule].statusSort);
    const pdict = await problem.getList(domainId, tdoc.pids, true, true, problem.PROJECTION_CONTEST_DETAIL);
    const [rows, udict] = await RULES[tdoc.rule].scoreboard(
        config, this.translate.bind(this),
        tdoc, pdict, tsdocsCursor,
    );
    await bus.parallel('contest/scoreboard', tdoc, rows, udict, pdict);
    return [tdoc, rows, udict, pdict];
}

export async function addClarification(
    domainId: string, tid: ObjectId, owner: number, content: string,
    ip: string, subject = 0,
) {
    const tdoc = owner > 0 ? await get(domainId, tid) : null;
    const audience = tdoc?.rule === 'icpc_domjudge'
        ? { arenaParticipant: tdoc.allowTeam ? await getTeamVid(domainId, tid, owner) ?? owner : owner } : {};
    return document.add(
        domainId, content, owner, document.TYPE_CONTEST_CLARIFICATION,
        null, document.TYPE_CONTEST, tid, { ip, subject, ...audience },
    );
}

export function addClarificationReply(
    domainId: string, did: ObjectId, owner: number,
    content: string, ip: string,
) {
    return document.push(
        domainId, document.TYPE_CONTEST_CLARIFICATION, did,
        'reply', { content, owner, ip },
    );
}

export function getClarification(domainId: string, did: ObjectId) {
    return document.get(domainId, document.TYPE_CONTEST_CLARIFICATION, did);
}

export function isOwnClarification(item: { owner: number, arenaParticipant?: number }, participant: number, viewer: number) {
    return item.owner > 0 && (Number.isSafeInteger(item.arenaParticipant) ? item.arenaParticipant === participant : item.owner === viewer);
}

export function getMultiClarification(domainId: string, tid: ObjectId, owner?: number | number[],
    audience?: { participant: number, viewer: number }) {
    const ownerFilter = audience ? { $or: [{ owner: 0 }, { arenaParticipant: audience.participant },
        { arenaParticipant: { $exists: false }, owner: audience.viewer }] } : owner === undefined
        ? {}
        : { owner: { $in: [0, ...(Array.isArray(owner) ? owner : [owner])] } };
    return document.getMulti(
        domainId, document.TYPE_CONTEST_CLARIFICATION,
        { parentType: document.TYPE_CONTEST, parentId: tid, ...ownerFilter },
    ).sort('_id', -1).toArray();
}

export function applyProjection(tdoc: Tdoc, rdoc: RecordDoc, udoc: User) {
    if (!RULES[tdoc.rule]) return rdoc;
    return RULES[tdoc.rule].applyProjection(tdoc, rdoc, udoc);
}

export const statusText = (tdoc: Tdoc, tsdoc?: ContestStatusDoc): string => (
    isNew(tdoc)
        ? 'New'
        : isUpcoming(tdoc)
            ? 'Ready (☆▽☆)'
            : isOngoing(tdoc, tsdoc)
                ? 'Live...'
                : 'Done');

export function addPrintTask(domainId: string, tid: ObjectId, uid: number, name: string, content: string) {
    return document.add(domainId, content, uid, document.TYPE_CONTEST_PRINT, null, document.TYPE_CONTEST, tid, {
        title: name,
        status: PrintTaskStatus.pending,
    });
}

export async function updatePrintTask(domainId: string, tid: ObjectId, taskId: ObjectId, $set: Partial<ContestPrintDoc>) {
    const res = await document.coll.updateOne({
        domainId, docType: document.TYPE_CONTEST_PRINT,
        docId: taskId, parentType: document.TYPE_CONTEST, parentId: tid,
    }, { $set });
    return !!res.modifiedCount;
}

export function allocatePrintTask(domainId: string, tid: ObjectId) {
    return document.coll.findOneAndUpdate({
        domainId, docType: document.TYPE_CONTEST_PRINT,
        parentType: document.TYPE_CONTEST, parentId: tid,
        status: PrintTaskStatus.pending,
    }, {
        $set: {
            status: PrintTaskStatus.printing,
        },
    }, { returnDocument: 'after' });
}

export function getMultiPrintTask(domainId: string, tid: ObjectId, query = {}) {
    return document.getMulti(domainId, document.TYPE_CONTEST_PRINT, { parentType: document.TYPE_CONTEST, parentId: tid, ...query })
        .sort({ _id: 1 });
}

export async function apply(ctx: Context) {
    ctx.on('contest/balloon', (domainId, tid, bdoc) => {
        if (!bdoc.first) return;
        (async () => {
            const tsdocs = await getMultiStatus(domainId, { docId: tid, subscribe: 1 }).toArray();
            const uids = Array.from<number>(new Set(tsdocs.flatMap((tsdoc) => (tsdoc.members?.length ? tsdoc.members : [tsdoc.uid]))));
            const [team, tdoc, pdoc] = await Promise.all([
                UserModel.getById(domainId, bdoc.uid),
                get(domainId, tid),
                ProblemModel.get(domainId, bdoc.pid),
            ]);
            await MessageModel.send(1, uids, JSON.stringify({
                message: 'First Blood Notice\n{0} solved problem {1} ({2})',
                avatar: avatar(team.avatar),
                params: [team.uname, getAlphabeticId(tdoc.pids.indexOf(bdoc.pid)), pdoc.title],
            }), MessageModel.FLAG_I18N);
        })();
    });
    await ctx.db.ensureIndexes(
        collBalloon,
        { key: { domainId: 1, tid: 1, pid: 1, uid: 1 }, unique: true, name: 'basic' },
        { key: { domainId: 1, tid: 1, pid: 1 }, unique: true, name: 'first', partialFilterExpression: { first: true } },
    );
}

global.Hydro.model.contest = {
    apply,

    RULES,
    PrintTaskStatus,
    buildContestRule,
    add,
    getListStatus,
    getMultiStatus,
    getTeamVid,
    getRecordParticipant,
    isSameTeam,
    isOwnOrTeammateRecord,
    attend,
    cancelAttend,
    edit,
    del,
    get,
    getRelated,
    updateStatus,
    getStatus,
    getParticipantRecordQuery,
    count,
    countStatus,
    getMulti,
    setStatus,
    getAndListStatus,
    recalcStatus,
    unlockScoreboard,
    getBalloon,
    addBalloon,
    getMultiBalloon,
    updateBalloon,
    setBalloonDelivery,
    canShowRecord,
    canShowSelfRecord,
    canShowScoreboard,
    canViewHiddenScoreboard,
    getScoreboard,
    addClarification,
    addClarificationReply,
    getClarification,
    getMultiClarification,
    isOwnClarification,
    isNew,
    isUpcoming,
    isNotStarted,
    isOngoing,
    isDone,
    isLocked,
    isExtended,
    applyProjection,
    statusText,
    addPrintTask,
    updatePrintTask,
    allocatePrintTask,
    getMultiPrintTask,
};
