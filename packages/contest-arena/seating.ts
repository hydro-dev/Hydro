import { identityKey } from './mode-policy';

export interface ParticipantLocation {
    classroom: string;
    seat: string;
}

export function participantLocation(input: unknown): ParticipantLocation {
    if (!input || typeof input !== 'object' || Array.isArray(input)) throw new TypeError('教室和座位号格式无效');
    const field = (name: string, label: string, limit: number) => {
        const value = (input as any)[name];
        if (value === undefined) return '';
        if (typeof value !== 'string') throw new TypeError(`${label}请填写文本`);
        const text = value.trim();
        const control = [...text].some((char) => char.codePointAt(0) < 32 || char.codePointAt(0) === 127);
        if (text.length > limit || control) throw new Error(`${label}最多 ${limit} 个字符，不能包含换行或控制字符`);
        return text;
    };
    return { classroom: field('classroom', '教室', 100), seat: field('seat', '座位号', 40) };
}

export const locationKey = (location?: ParticipantLocation) =>
    JSON.stringify(location ? [location.classroom, location.seat] : null);

export function locationAssignments(input: unknown, uids: number[]) {
    const locations = new Map<number, ParticipantLocation>();
    if (input === undefined) return locations;
    if (!input || typeof input !== 'object' || Array.isArray(input)) throw new Error('座位配置格式无效');
    for (const [key, value] of Object.entries(input)) {
        const uid = Number(key);
        if (!Number.isSafeInteger(uid) || String(uid) !== key || !uids.includes(uid)) throw new Error('座位配置中包含未选择的参赛者');
        locations.set(uid, participantLocation(value));
    }
    return locations;
}

export interface RosterEntry {
    line: number;
    className: string;
    name: string;
    location?: ParticipantLocation;
}

export function groupRosterEntries(rows: RosterEntry[]) {
    const groups = new Map<string, RosterEntry & { lines: number[] }>();
    for (const row of rows) {
        const key = JSON.stringify([identityKey(row.className, row.name), locationKey(row.location)]);
        if (groups.has(key)) groups.get(key).lines.push(row.line);
        else groups.set(key, { ...row, lines: [row.line] });
    }
    return [...groups.values()];
}
