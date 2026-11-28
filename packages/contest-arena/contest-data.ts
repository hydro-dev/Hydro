import { createHash } from 'crypto';
import { balloonConfig } from './balloon-data';
import { ranked, score } from './scoring';

const classId = (name: string) => `class-${createHash('sha256').update(name).digest('hex').slice(0, 16)}`;
export const resolverTeamId = (uid: number) => `team-${uid < 0 ? `g${-uid}` : uid}`;

/** Shared, explicitly public ICPC team/problem metadata for live feeds and Resolver archives. */
export function contestEntities(tdoc: any, statuses: any[], users: Record<number, any>, pdict: Record<number, any>) {
    const active = statuses.filter((row) => row.attend && !row.registrationCancelled);
    const rows = ranked(active.map((row) => ({ ...row, ...score(tdoc, row.journal || []) })));
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
    const colors = balloonConfig(tdoc);
    const problems = tdoc.pids.map((pid, index) => {
        if (!pdict[pid]) throw new Error(`比赛题目 ${pid} 不存在`);
        return {
            id: String(pid),
            label: String.fromCharCode(65 + index),
            ordinal: index,
            name: pdict[pid].title,
            color: colors[pid].name,
            rgb: colors[pid].color,
            time_limit: Number.isFinite(pdict[pid].config?.timeMax) ? pdict[pid].config.timeMax / 1000 : 1,
            test_data_count:
                Number.isSafeInteger(pdict[pid].config?.count) && pdict[pid].config.count >= 0 ? pdict[pid].config.count : 0,
        };
    });
    return { rows, teams, organizations, groups, problems };
}
