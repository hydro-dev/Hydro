import { sumBy } from 'lodash';
import { Filter, ObjectId } from 'mongodb';
import {
    Counter, formatSeconds, getAlphabeticId, sleep, Time,
} from '@hydrooj/utils/lib/utils';
import { Context } from '../context';
import {
    ContestAlreadyAttendedError, ContestNotFoundError,
    ContestScoreboardHiddenError, ValidationError,
} from '../error';
import {
    BaseUserDict, ContestPrintDoc, ContestRule, ContestRules, ProblemDict, RecordDoc,
    ScoreboardConfig, ScoreboardNode, ScoreboardRow, SubtaskResult, Tdoc,
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

export function isLocked(tdoc: Tdoc, time = new Date()) {
    if (!tdoc.lockAt) return false;
    return tdoc.lockAt < time && !tdoc.unlocked;
}

export function isExtended(tdoc: Tdoc) {
    const now = new Date().getTime();
    return tdoc.penaltySince.getTime() <= now && now < tdoc.endAt.getTime();
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
            { type: 'user', value: _('User') },
        ];
        if (config.isExport && config.showDisplayName) {
            columns.push({ type: 'email', value: _('Email') });
            columns.push({ type: 'string', value: _('School') });
            columns.push({ type: 'string', value: _('Name') });
            columns.push({ type: 'string', value: _('Student ID') });
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
            { type: 'user', value: udoc.uname, raw: tsdoc.uid },
        ];
        if (config.isExport && config.showDisplayName) {
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
        const udict = await UserModel.getListForRender(tdoc.domainId, uids, config.showDisplayName ? ['displayName'] : []);
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
    showScoreboard: (tdoc, now) => now > tdoc.endAt,
    showSelfRecord: (tdoc, now) => now > tdoc.endAt,
    showRecord: (tdoc, now) => now > tdoc.endAt,
    async scoreboardHeader(config, _, tdoc, pdict) {
        const columns: ScoreboardNode[] = [
            { type: 'rank', value: '#' },
            { type: 'user', value: _('User') },
        ];
        if (config.isExport && config.showDisplayName) {
            columns.push({ type: 'email', value: _('Email') });
            columns.push({ type: 'string', value: _('School') });
            columns.push({ type: 'string', value: _('Name') });
            columns.push({ type: 'string', value: _('Student ID') });
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
            { type: 'user', value: udoc.uname, raw: tsdoc.uid },
        ];
        const displayScore = (pid: number, score?: number) => {
            if (typeof score !== 'number') return '-';
            return score * ((tdoc.score?.[pid] || 100) / 100);
        };
        if (config.isExport && config.showDisplayName) {
            row.push({ type: 'email', value: udoc.mail });
            row.push({ type: 'string', value: udoc.school || '' });
            row.push({ type: 'string', value: udoc.displayName || '' });
            row.push({ type: 'string', value: udoc.studentId || '' });
        }
        row.push({ type: 'total_score', value: tsdoc.score || 0 });
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
        const udict = await UserModel.getListForRender(tdoc.domainId, uids, config.showDisplayName ? ['displayName'] : []);
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
    showRecord: (tdoc, now) => now > tdoc.endAt,
    showSelfRecord: () => true,
    showScoreboard: (tdoc, now) => now > tdoc.endAt,
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
            { type: 'user', value: udoc.uname, raw: tsdoc.uid },
        ];
        if (config.isExport && config.showDisplayName) {
            row.push({ type: 'email', value: udoc.mail });
            row.push({ type: 'string', value: udoc.school || '' });
            row.push({ type: 'string', value: udoc.displayName || '' });
            row.push({ type: 'string', value: udoc.studentId || '' });
        }
        row.push({ type: 'total_score', value: tsdoc.score || 0 });
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
            { type: 'user', value: udoc.uname, raw: tsdoc.uid },
        ];
        if (config.isExport && config.showDisplayName) {
            row.push({ type: 'email', value: udoc.mail });
            row.push({ type: 'string', value: udoc.school || '' });
            row.push({ type: 'string', value: udoc.displayName || '' });
            row.push({ type: 'string', value: udoc.studentId || '' });
        }
        row.push({
            type: 'total_score',
            value: tsdoc.score || 0,
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
            { type: 'user', value: _('User') },
        ];
        if (config.isExport && config.showDisplayName) {
            columns.push({ type: 'email', value: _('Email') });
            columns.push({ type: 'string', value: _('School') });
            columns.push({ type: 'string', value: _('Name') });
            columns.push({ type: 'string', value: _('Student ID') });
        }
        columns.push({ type: 'total_score', value: _('Score') });
        if (config.isExport) {
            columns.push({ type: 'string', value: _('Original Score') });
        }
        columns.push({ type: 'time', value: _('Total Time') });
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
                    {
                        type: 'time',
                        value: '#{0} {1}'.format(i, _('Time (Seconds)')),
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
                type: 'user',
                value: udoc.uname,
                raw: tsdoc.uid,
            },
        ];
        if (config.isExport && config.showDisplayName) {
            row.push({ type: 'email', value: udoc.mail });
            row.push({ type: 'string', value: udoc.school || '' });
            row.push({ type: 'string', value: udoc.displayName || '' });
            row.push({ type: 'string', value: udoc.studentId || '' });
        }
        row.push({ type: 'string', value: tsdoc.penaltyScore || 0 });
        if (config.isExport) {
            row.push({ type: 'string', value: tsdoc.score || 0 });
        }
        row.push({ type: 'time', value: formatSeconds(tsdoc.time || 0, false), raw: tsdoc.time });
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
            const colScore = tsddict[pid]?.penaltyScore ?? '';
            const colOriginalScore = tsddict[pid]?.score ?? '';
            const colTime = tsddict[pid]?.time || '';
            const colTimeStr = colTime ? formatSeconds(colTime, false) : '';
            if (config.isExport) {
                row.push(
                    { type: 'string', value: colScore },
                    { type: 'string', value: colOriginalScore },
                    { type: 'time', value: colTime },
                );
            } else {
                row.push({
                    type: 'record',
                    score: tsddict[pid]?.score,
                    value: colScore === colOriginalScore
                        ? '{0}\n{1}'.format(colScore, colTimeStr)
                        : '{0} / {1}\n{2}'.format(colScore, colOriginalScore, colTimeStr),
                    raw: rid,
                });
            }
        }
        return row;
    },
    async scoreboard(config, _, tdoc, pdict, cursor) {
        const rankedTsdocs = await db.ranked(cursor, (a, b) => a.score === b.score);
        const uids = rankedTsdocs.map(([, tsdoc]) => tsdoc.uid);
        const udict = await UserModel.getListForRender(tdoc.domainId, uids, config.showDisplayName ? ['displayName'] : []);
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

function _getStatusJournal(tsdoc) {
    return tsdoc.journal.sort((a, b) => (a.rid.getTimestamp() - b.rid.getTimestamp()));
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
    if (!tdoc) throw new ContestNotFoundError(tid);
    return tdoc;
}

export async function getRelated(domainId: string, pid: number, rule?: string) {
    const rules = Object.keys(RULES).filter((i) => !RULES[i].hidden);
    return await document.getMulti(domainId, document.TYPE_CONTEST, { pids: pid, rule: rule || { $in: rules } }).toArray();
}

export async function addBalloon(domainId: string, tid: ObjectId, uid: number, rid: ObjectId, pid: number) {
    const balloon = await collBalloon.find({ domainId, tid, pid }).project({ uid: 1 }).toArray();
    if (balloon.find((i) => i.uid === uid)) return null;
    let isFirst = !balloon.length;
    if (isFirst) {
        let pending: RecordDoc[] = [];
        do {
            if (pending.length) await sleep(500); // eslint-disable-line no-await-in-loop
            pending = await RecordModel.getMulti(domainId, { // eslint-disable-line no-await-in-loop
                pid, contest: tid, _id: { $lt: rid }, status: {
                    $in: [
                        STATUS.STATUS_WAITING, STATUS.STATUS_COMPILING,
                        STATUS.STATUS_JUDGING, STATUS.STATUS_FETCHED,
                        STATUS.STATUS_ACCEPTED,
                    ],
                },
            }).limit(1).toArray();
        } while (pending.length && !pending.some((i) => i.status === STATUS.STATUS_ACCEPTED));
        if (pending.some((i) => i.status === STATUS.STATUS_ACCEPTED)) isFirst = false;
    }
    const newBdoc = {
        _id: rid, domainId, tid, pid, uid, ...(isFirst ? { first: true } : {}),
    };
    await collBalloon.insertOne(newBdoc);
    bus.emit('contest/balloon', domainId, tid, newBdoc);
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

export async function getStatus(domainId: string, tid: ObjectId, uid: number) {
    return await document.getStatus(domainId, document.TYPE_CONTEST, tid, uid);
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
    if (tdoc.balloon && status === STATUS.STATUS_ACCEPTED && !isLocked(tdoc)) await addBalloon(domainId, tid, uid, rid, pid);
    const tsdoc = await document.revPushStatus(tdoc.domainId, document.TYPE_CONTEST, tdoc.docId, uid, 'journal', {
        rid, pid, status, score, subtasks, lang,
    }, 'rid');
    const journal = _getStatusJournal(tsdoc);
    const stats = RULES[tdoc.rule].stat(tdoc, journal);
    return await document.revSetStatus(tdoc.domainId, document.TYPE_CONTEST, tdoc.docId, uid, tsdoc.rev, { journal, ...stats });
}

export async function getListStatus(domainId: string, uid: number, tids: ObjectId[]) {
    const r = {};
    // eslint-disable-next-line no-await-in-loop
    for (const tid of tids) r[tid.toHexString()] = await getStatus(domainId, tid, uid);
    return r;
}

export async function attend(domainId: string, tid: ObjectId, uid: number, payload: any = {}) {
    try {
        await document.cappedIncStatus(domainId, document.TYPE_CONTEST, tid, uid, 'attend', 1, 0, 1, payload);
    } catch (e) {
        throw new ContestAlreadyAttendedError(tid, uid);
    }
    await document.inc(domainId, document.TYPE_CONTEST, tid, 'attend', 1);
    return {};
}

export function getMultiStatus(domainId: string, query: any) {
    return document.getMultiStatus(domainId, document.TYPE_CONTEST, query);
}

export function setStatus(domainId: string, tid: ObjectId, uid: number, $set: any) {
    return document.setStatus(domainId, document.TYPE_CONTEST, tid, uid, $set);
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
    const tsdocs = await document.getMultiStatus(domainId, document.TYPE_CONTEST, { docId: tid })
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

export function addClarification(
    domainId: string, tid: ObjectId, owner: number, content: string,
    ip: string, subject = 0,
) {
    return document.add(
        domainId, content, owner, document.TYPE_CONTEST_CLARIFICATION,
        null, document.TYPE_CONTEST, tid, { ip, subject },
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

export function getMultiClarification(domainId: string, tid: ObjectId, owner?: number) {
    return document.getMulti(
        domainId, document.TYPE_CONTEST_CLARIFICATION,
        { parentType: document.TYPE_CONTEST, parentId: tid, ...(typeof owner === 'number' ? { owner: { $in: [owner, 0] } } : {}) },
    ).sort('_id', -1).toArray();
}

export function applyProjection(tdoc: Tdoc, rdoc: RecordDoc, udoc: User) {
    if (!RULES[tdoc.rule]) return rdoc;
    return RULES[tdoc.rule].applyProjection(tdoc, rdoc, udoc);
}

export const statusText = (tdoc: Tdoc, tsdoc?: any) => (
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
            const uids = Array.from<number>(new Set(tsdocs.map((tsdoc) => tsdoc.uid)));
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
    attend,
    edit,
    del,
    get,
    getRelated,
    updateStatus,
    getStatus,
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
    canShowRecord,
    canShowSelfRecord,
    canShowScoreboard,
    canViewHiddenScoreboard,
    getScoreboard,
    addClarification,
    addClarificationReply,
    getClarification,
    getMultiClarification,
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
