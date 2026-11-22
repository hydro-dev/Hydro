import { createHash } from 'crypto';
import { medalCounts, medalFor, problemColors } from './scoreboard';
import { excludedStatuses, pendingStatuses, ranked, score } from './scoring';

/** ICPC Contest API 2026-01 snapshot. Exporting never changes the contest. */
export const resolverJudgements: Record<number, { id: string, name: string, penalty: boolean, solved: boolean }> = {
    1: { id: 'AC', name: 'Accepted', penalty: false, solved: true },
    2: { id: 'WA', name: 'Wrong answer', penalty: true, solved: false },
    3: { id: 'TLE', name: 'Time limit exceeded', penalty: true, solved: false },
    4: { id: 'MLE', name: 'Memory limit exceeded', penalty: true, solved: false },
    5: { id: 'OLE', name: 'Output limit exceeded', penalty: true, solved: false },
    6: { id: 'RTE', name: 'Run-time error', penalty: true, solved: false },
    7: { id: 'CE', name: 'Compiler error', penalty: false, solved: false },
    11: { id: 'WA', name: 'Wrong answer', penalty: true, solved: false },
};
const ignored = excludedStatuses;
const hex = (id: any) => id.toHexString?.() || String(id);
const classId = (name: string) => `class-${createHash('sha256').update(name).digest('hex').slice(0, 16)}`;
export const resolverTeamId = (uid: number) => `team-${uid < 0 ? `g${-uid}` : uid}`;

export const resolverWindowsLauncher = [
    '@echo off',
    'setlocal',
    'set "ICPC_FONT=Microsoft YaHei"',
    'set "HGNU_RESOLVER_DIR=%~1"',
    'if not defined HGNU_RESOLVER_DIR if exist "%~dp0..\\resolver\\lib\\resolver.jar" set "HGNU_RESOLVER_DIR=%~dp0..\\resolver"',
    'if not defined HGNU_RESOLVER_DIR set /p "HGNU_RESOLVER_DIR=ICPC Resolver directory (contains lib): "',
    'set "HGNU_RESOLVER_DIR=%HGNU_RESOLVER_DIR:"=%"',
    'if not exist "%HGNU_RESOLVER_DIR%\\lib\\resolver.jar" (',
    '  echo Resolver not found. Please enter the extracted ICPC Tools Resolver directory.',
    '  pause',
    '  exit /b 1',
    ')',
    'java -Xmx1024m -cp "%HGNU_RESOLVER_DIR%\\lib\\*" org.icpc.tools.resolver.Resolver "%~dp0."',
    'if errorlevel 1 pause',
    '',
].join('\r\n');

export function relativeTime(ms: number) {
    if (!Number.isSafeInteger(ms) || ms < 0) throw new Error('无效的比赛时间');
    const hours = Math.floor(ms / 3600000);
    const minutes = String(Math.floor(ms / 60000) % 60).padStart(2, '0');
    const seconds = String(Math.floor(ms / 1000) % 60).padStart(2, '0');
    return `${hours}:${minutes}:${seconds}.${String(ms % 1000).padStart(3, '0')}`;
}

export function resolverFreeze(tdoc: any, minutes?: string | number) {
    const start = +new Date(tdoc.beginAt);
    const end = +new Date(tdoc.endAt);
    if (!Number.isSafeInteger(start) || !Number.isSafeInteger(end) || end <= start) throw new Error('比赛时间不正确');
    if (tdoc.lockAt) {
        const freeze = +new Date(tdoc.lockAt);
        if (freeze < start || freeze >= end) throw new Error('比赛封榜时间必须在比赛开始至结束之间');
        return { freezeAt: new Date(freeze), replay: false, minutes: (end - freeze) / 60000 };
    }
    const value = minutes == null ? Math.min(60, (end - start) / 60000) : Number(minutes);
    const duration = Math.round(value * 60000);
    if (
        !Number.isFinite(value)
        || value <= 0
        || !Number.isSafeInteger(duration)
        || duration <= 0
        || duration > end - start
    ) {
        throw new Error('回放封榜时长必须大于 0，且不能超过比赛持续时间');
    }
    return { freezeAt: new Date(end - duration), replay: true, minutes: duration / 60000 };
}

export function buildResolverData(
    tdoc: any,
    statuses: any[],
    users: Record<number, any>,
    pdict: Record<number, any>,
    languages: Record<string, any>,
    options: { now?: Date, freezeMinutes?: string | number } = {},
) {
    const now = options.now || new Date();
    const start = +new Date(tdoc.beginAt);
    const end = +new Date(tdoc.endAt);
    if (tdoc.rule !== 'icpc_domjudge') throw new Error('该导出仅适用于现场赛');
    if (+now < end) throw new Error('比赛结束后才能导出滚榜包');
    const freeze = resolverFreeze(tdoc, options.freezeMinutes);
    const id = hex(tdoc.docId || tdoc._id);
    if (!/^[a-f0-9]{24}$/.test(id)) throw new Error('无效的比赛编号');
    const active = statuses.filter((row) => row.attend && !row.registrationCancelled);
    const rows = ranked(active.map((row) => ({ ...row, ...score(tdoc, row.journal || []) })));
    const frozenRows = ranked(active.map((row) => ({ ...row, ...score(tdoc, row.journal || [], freeze.freezeAt) })));
    const medals = medalCounts(tdoc.medals);
    const teams: any[] = [];
    const organizations: any[] = [];
    const groups: any[] = [
        { id: 'participants', name: '正式参赛者' },
        { id: 'observers', name: '打星参赛者' },
    ];
    const knownClasses = new Set<string>();
    const knownTeams = new Set<number>();
    const image = (path: string) => [{ href: path, filename: path.split('/').at(-1), mime: 'image/png' }];
    for (const row of rows) {
        if (knownTeams.has(row.uid)) throw new Error('参赛者数据重复，请先检查报名数据');
        knownTeams.add(row.uid);
        const udoc = users[row.uid] || {};
        const members = row.members?.length ? row.members : [row.uid];
        const affiliation =
            [...new Set(members.map((uid) => users[uid]?.class).filter(Boolean))].join(' / ') || '未填写班级';
        const group = classId(affiliation);
        const team = resolverTeamId(row.uid);
        if (!knownClasses.has(group)) {
            knownClasses.add(group);
            groups.push({ id: group, name: affiliation });
        }
        // A per-team affiliation preserves the class caption and the account's row logo.
        // Class groups still represent actual classes, independently of these display logos.
        const organization = `affiliation-${team}`;
        organizations.push({
            id: organization,
            name: affiliation,
            formal_name: affiliation,
            logo: image(`organizations/${organization}/logo.png`),
        });
        const displayName = `${affiliation}-${row.displayName || udoc.name || udoc.displayName || udoc.uname || `Team ${row.uid}`}`;
        teams.push({
            id: team,
            label: String(row.uid),
            name: displayName,
            display_name: displayName,
            organization_id: organization,
            group_ids: [row.unrank ? 'observers' : 'participants', group],
            hidden: !!row.unrank,
            photo: image(`teams/${team}/photo.png`),
        });
    }
    const problems = tdoc.pids.map((pid, index) => {
        if (!pdict[pid]) throw new Error(`比赛题目 ${pid} 不存在`);
        const configured = tdoc.balloon?.[pid];
        let color = typeof configured === 'string' ? configured : configured?.color;
        if (!/^#(?:[a-f0-9]{3}|[a-f0-9]{6})$/i.test(color || '')) color = problemColors[index % problemColors.length];
        if (color.length === 4) {
            color = `#${color
                .slice(1)
                .split('')
                .map((c) => c + c)
                .join('')}`;
        }
        return {
            id: String(pid),
            label: String.fromCharCode(65 + index),
            ordinal: index,
            name: pdict[pid].title,
            color: String.fromCharCode(65 + index),
            rgb: color,
            time_limit: Number.isFinite(pdict[pid].config?.timeMax) ? pdict[pid].config.timeMax / 1000 : 1,
            test_data_count:
                Number.isSafeInteger(pdict[pid].config?.count) && pdict[pid].config.count >= 0 ? pdict[pid].config.count : 0,
        };
    });
    const submissions: any[] = [];
    const judgements: any[] = [];
    const knownRuns = new Map<string, string>();
    const languageIds = new Set<string>();
    let ignoredRuns = 0;
    for (const row of rows) {
        for (const entry of [...(row.journal || [])].sort((a, b) => hex(a.rid).localeCompare(hex(b.rid)))) {
            const stamp = +entry.rid.getTimestamp();
            if (!tdoc.pids.includes(entry.pid) || stamp < start || stamp >= end) continue;
            const rid = hex(entry.rid);
            const team = resolverTeamId(row.uid);
            const signature = JSON.stringify([team, entry.pid, entry.status, entry.lang]);
            if (knownRuns.has(rid)) {
                if (knownRuns.get(rid) !== signature) throw new Error('同一提交存在冲突的判定数据');
                continue;
            }
            knownRuns.set(rid, signature);
            if (pendingStatuses.has(entry.status)) throw new Error('仍有等待或正在评测的提交，请评测完成后再导出');
            if (ignored.has(entry.status)) {
                ignoredRuns++;
                continue;
            }
            const verdict = resolverJudgements[entry.status];
            if (!verdict) throw new Error(`存在无法导出的判定状态 ${entry.status}`);
            const language = entry.lang || 'unknown';
            if (!/^[a-zA-Z0-9_.+-]+$/.test(language)) throw new Error('提交的语言标识不正确');
            languageIds.add(language);
            const time = new Date(stamp).toISOString();
            const elapsed = relativeTime(stamp - start);
            submissions.push({
                id: rid,
                team_id: team,
                problem_id: String(entry.pid),
                language_id: language,
                time,
                contest_time: elapsed,
            });
            // This is a finalized snapshot, not a reconstruction of judge-machine timings.
            judgements.push({
                id: `judgement-${rid}`,
                submission_id: rid,
                judgement_type_id: verdict.id,
                start_time: time,
                end_time: time,
                start_contest_time: elapsed,
                end_contest_time: elapsed,
            });
        }
    }
    submissions.sort((a, b) => a.id.localeCompare(b.id));
    const languageObjects = [...languageIds].sort().map((key) => ({
        id: key,
        name: languages[key]?.display || key,
        extensions: [
            key.startsWith('cc')
                ? 'cpp'
                : key.startsWith('python') || key.startsWith('py')
                    ? 'py'
                    : key.startsWith('java')
                        ? 'java'
                        : key.split('.')[0],
        ],
    }));
    const contest = {
        id,
        name: tdoc.title,
        formal_name: tdoc.title,
        start_time: new Date(start).toISOString(),
        duration: relativeTime(end - start),
        scoreboard_freeze_duration: relativeTime(end - +freeze.freezeAt),
        scoreboard_type: 'pass-fail',
        penalty_time: '0:20:00.000',
        logo: image('contest/logo.png'),
    };
    const state = {
        started: new Date(start).toISOString(),
        frozen: freeze.freezeAt.toISOString(),
        ended: new Date(end).toISOString(),
        finalized: now.toISOString(),
        end_of_updates: now.toISOString(),
    };
    // Keep all three award definitions, including empty bands, so Resolver never invents default 4/4/4 medals.
    const awards = ['gold', 'silver', 'bronze'].map((kind, index) => ({
        id: `${kind}-medal`,
        citation: ['金牌', '银牌', '铜牌'][index],
        team_ids: rows.filter((row) => medalFor(row, medals) === kind).map((row) => resolverTeamId(row.uid)),
    }));
    const judgementTypes = [...new Map(Object.values(resolverJudgements).map((value) => [value.id, value])).values()];
    const collections = {
        groups,
        organizations,
        teams,
        languages: languageObjects,
        problems,
        'judgement-types': judgementTypes,
        submissions,
        judgements,
        awards,
    };
    let token = 0;
    const event = (type: string, data: any, singleton = false) => ({
        type,
        ...(singleton ? {} : { id: data.id }),
        data,
        token: `hgnu-${token++}`,
    });
    const events: any[] = [event('contest', contest, true)];
    for (const key of ['judgement-types', 'groups', 'organizations', 'teams', 'languages', 'problems']) {
        for (const item of collections[key]) events.push(event(key, item));
    }
    events.push(event('state', { started: state.started }, true));
    const judging = new Map(judgements.map((item) => [item.submission_id, item]));
    for (const submission of submissions) {
        events.push(event('submissions', submission));
        events.push(event('judgements', judging.get(submission.id)));
    }
    for (const item of awards) events.push(event('awards', item));
    events.push(event('state', state, true));
    const standings = (values: any[]) =>
        values.map((row) => ({
            team_id: resolverTeamId(row.uid),
            rank: row.rank,
            num_solved: row.accept,
            total_time_minutes: Math.floor(row.time / 60),
            last_solved_minutes: Math.floor(row.lastAccepted / 60),
            medal: medalFor(row, medals),
        }));
    return {
        contest,
        state,
        collections,
        events,
        rows,
        freeze,
        manifest: {
            format: 'ICPC Contest API 2026-01',
            source_contest: id,
            generated_at: now.toISOString(),
            scoring: 'whole minutes, 20-minute wrong-answer penalty, no CE penalty, last-AC tie break',
            freeze_at: freeze.freezeAt.toISOString(),
            replay_freeze: freeze.replay,
            source_unlocked: !!tdoc.unlocked,
            participants: rows.length,
            ranked_participants: rows.filter((row) => !row.unrank).length,
            submissions: submissions.length,
            excluded_judgements: ignoredRuns,
            medals,
            final_standings: standings(rows),
            frozen_standings: standings(frozenRows),
        },
    };
}
