import { createHash } from 'crypto';
import { contestEntities, resolverTeamId } from './contest-data';
import { relativeTime, resolverJudgements } from './resolver';
import { excludedStatuses, pendingStatuses } from './scoring';

export interface FeedObject {
    type: string;
    id?: string;
    data: any;
}
export const feedKey = (event: FeedObject) => `${event.type}/${event.id || ''}`;
export const feedHash = (value: any) => createHash('sha256').update(Buffer.isBuffer(value) ? value : JSON.stringify(value) ?? 'null').digest('hex');
export const feedOrder = [
    'contest', 'judgement-types', 'groups', 'organizations', 'teams', 'languages', 'problems',
    'submissions', 'judgements', 'awards', 'state',
];

/** Only whitelisted public data enters this projection. Records override stale contest journals during rejudges. */
export function buildLiveData(
    tdoc: any, statuses: any[], records: any[], users: Record<number, any>, pdict: Record<number, any>,
    languages: Record<string, any>, now = new Date(), previousState: any = {},
) {
    const cid = String(tdoc.docId);
    const start = +new Date(tdoc.beginAt); const end = +new Date(tdoc.endAt);
    if (tdoc.rule !== 'icpc_domjudge' || !/^[a-f0-9]{24}$/.test(cid)
        || !Number.isFinite(start) || !Number.isFinite(end) || end <= start) throw new Error('无效的现场赛');
    const before = +now < start;
    const lock = tdoc.lockAt ? +new Date(tdoc.lockAt) : null;
    if (lock !== null && (!Number.isFinite(lock) || lock < start || lock >= end)) throw new Error('封榜时间不正确');
    const frozen = lock !== null && +now >= lock && !tdoc.unlocked;
    const active = statuses.filter((row) => row.attend && !row.registrationCancelled);
    const owners = new Map<string, number>();
    const archived = new Set<string>();
    const members = new Map<number, number>();
    const hex = (id: any) => id?.toHexString?.() || String(id || '');
    for (const row of statuses) {
        for (const entry of row.journal || []) {
            const id = hex(entry.rid);
            if (!row.attend || row.registrationCancelled) archived.add(id);
            else {
                if (owners.has(id) && owners.get(id) !== row.uid) throw new Error('比赛日志归属冲突');
                owners.set(id, row.uid);
            }
        }
    }
    const projected = new Map<number, any>();
    for (const row of active) {
        if (projected.has(row.uid)) throw new Error('参赛者重复');
        projected.set(row.uid, { ...row, journal: [] });
        for (const uid of row.members?.length ? row.members : [row.uid]) {
            if (members.has(uid) && members.get(uid) !== row.uid) throw new Error('参赛者归属冲突');
            members.set(uid, row.uid);
        }
    }
    const submissions: any[] = []; const judgements: any[] = [];
    const languageIds = new Set<string>(); const seen = new Set<string>();
    for (const record of [...records].sort((a, b) => hex(a._id).localeCompare(hex(b._id)))) {
        const id = hex(record._id); const stamp = +record._id?.getTimestamp?.();
        if (before || !/^[a-f0-9]{24}$/.test(id) || seen.has(id) || archived.has(id)
            || String(record.contest) !== cid || record.domainId !== tdoc.domainId
            || !tdoc.pids.includes(record.pid) || !Number.isFinite(stamp) || stamp < start || stamp >= end || stamp > +now) continue;
        seen.add(id);
        const uid = owners.get(id) ?? members.get(record.uid);
        const row = projected.get(uid);
        if (!row || (row.uid !== record.uid && !row.members?.includes(record.uid))) continue;
        if (excludedStatuses.has(record.status)) continue;
        const pending = pendingStatuses.has(record.status);
        const verdict = resolverJudgements[record.status];
        if (!pending && !verdict) throw new Error('存在不支持的判定状态');
        const hidden = frozen && stamp >= lock;
        const lang = record.lang || 'unknown';
        if (!/^[a-zA-Z0-9_.+-]+$/.test(lang)) throw new Error('无效的语言标识');
        languageIds.add(lang);
        row.journal.push({ rid: record._id, pid: record.pid, status: hidden ? 0 : record.status, lang });
        submissions.push({ id, team_id: resolverTeamId(uid), problem_id: String(record.pid), language_id: lang,
            time: new Date(stamp).toISOString(), contest_time: relativeTime(stamp - start) });
        // A submission without a judgement is queued in the ICPC model. Hydro does not
        // persist a separate judge-start time; an incomplete judgement crashes the
        // official presentation client's buffered model even if its validator accepts it.
        if (hidden || pending) continue;
        const judged = record.judgeAt instanceof Date && Number.isFinite(+record.judgeAt) ? record.judgeAt : new Date(stamp);
        const version = feedHash([record.status, judged.toISOString()]).slice(0, 16);
        judgements.push({ id: `judgement-${id}-${version}`, submission_id: id,
            // Hydro does not persist a separate judge-start timestamp. No fictitious runtime duration is exported.
            judgement_type_id: verdict.id, start_time: judged.toISOString(), end_time: judged.toISOString(),
            start_contest_time: relativeTime(Math.max(0, +judged - start)),
            end_contest_time: relativeTime(Math.max(0, +judged - start)) });
    }
    const entities = contestEntities(tdoc, [...projected.values()], users, pdict);
    for (const team of entities.teams) {
        // ICPC Tools resolves relative media URLs against the API root, not the contest URL.
        team.photo = [{ href: `contests/${cid}/images/${team.id}.png`, mime: 'image/png', width: 160, height: 160 }];
        entities.organizations.find((org) => org.id === team.organization_id).logo = team.photo;
    }
    if (before) for (const problem of entities.problems) problem.name = `Problem ${problem.label}`;
    const knownLanguages = new Set([...languageIds, ...Object.keys(languages).filter((id) => /^cc\./.test(id))]);
    const langObjects = [...knownLanguages].sort().map((id) => ({ id, name: languages[id]?.display || id }));
    const contest = { id: cid, name: tdoc.title, formal_name: tdoc.title, start_time: new Date(start).toISOString(),
        duration: relativeTime(end - start), scoreboard_type: 'pass-fail', penalty_time: '0:20:00.000',
        scoreboard_freeze_duration: relativeTime(lock === null ? 0 : end - lock),
        logo: [{ href: `contests/${cid}/images/logo.png`, mime: 'image/png', width: 512, height: 511 }] };
    const state = { started: before ? null : new Date(start).toISOString(),
        frozen: lock !== null && +now >= lock ? new Date(lock).toISOString() : null,
        ended: +now >= end ? new Date(end).toISOString() : null,
        // The native contest stores an unlock flag, not its timestamp. Persist the first observed transition.
        thawed: lock !== null && tdoc.unlocked && +now >= lock ? previousState.thawed || now.toISOString() : null };
    const collections: Record<string, any[]> = { 'judgement-types': [...new Map(Object.values(resolverJudgements).map((v) => [v.id, v])).values()],
        groups: entities.groups, organizations: entities.organizations, teams: entities.teams, languages: langObjects,
        problems: entities.problems, submissions, judgements, awards: [] };
    const objects: FeedObject[] = [{ type: 'contest', data: contest }];
    for (const type of feedOrder) {
        if (collections[type]) {
            for (const data of collections[type]) objects.push({ type, id: data.id, data });
        }
    }
    objects.push({ type: 'state', data: state });
    const first = new Map<number, number>();
    for (const row of entities.rows.filter((r) => !r.unrank)) {
        for (const [pid, cell] of Object.entries<any>(row.detail)) {
            if (cell.status === 1) first.set(+pid, Math.min(first.get(+pid) ?? Infinity, +cell.rid.getTimestamp()));
        }
    }
    const scoreboard = { time: now.toISOString(), contest_time: relativeTime(Math.max(0, +now - start)), state,
        rows: entities.rows.filter((r) => !r.unrank).map((row) => ({ rank: row.rank, team_id: resolverTeamId(row.uid),
            score: { num_solved: row.accept, total_time: row.time / 60 },
            problems: tdoc.pids.map((pid) => {
                const cell = row.detail[pid];
                return { problem_id: String(pid), num_judged: cell?.attempts || 0, num_pending: cell?.npending || 0,
                    solved: cell?.status === 1, ...(cell?.status === 1 ? { time: cell.real / 60,
                        first_to_solve: +cell.rid.getTimestamp() === first.get(pid) } : {}) };
            }) })) };
    // Normal clock, freeze, thaw and roster transitions are ordinary deltas. Resetting the
    // official client's history after judgement deletions can leave its cached ranks stale.
    const policy = feedHash([start, end, lock]);
    return { contest, state, collections, objects, scoreboard, policy, rows: entities.rows };
}

/** An old checkpoint or cursor must never replay a verdict hidden by the current projection. */
export function publicFeedEvent(event: FeedObject, visibleJudgements: Set<string>): FeedObject {
    return event.type === 'judgements' && event.data && !visibleJudgements.has(event.id)
        ? { ...event, data: null } : event;
}

/** Delete obsolete judgements before their replacements; define references before their dependants. */
export function changesBetween(previous: Map<string, FeedObject>, next: FeedObject[]) {
    const wanted = new Map(next.map((object) => [feedKey(object), object]));
    const removed = [...previous].filter(([key]) => !wanted.has(key)).map(([, object]) => ({ ...object, data: null }))
        .sort((a, b) => feedOrder.indexOf(b.type) - feedOrder.indexOf(a.type));
    const added = next.filter((object) => feedHash(previous.get(feedKey(object))) !== feedHash(object));
    return [...removed, ...added];
}
