/** A shared scorer for the arena and Hydro's native scoreboard/RP integration. */
export interface Entry {
    rid: { toHexString(): string, getTimestamp(): Date };
    pid: number;
    status: number;
    score?: number;
    lang?: string;
    [key: string]: any;
}

export const pendingStatuses = new Set([0, 20, 21, 22]);
export const excludedStatuses = new Set([8, 9, 10, 30, 31]);
const penalizedStatuses = new Set([2, 3, 4, 5, 6, 11]);
export const verdicts: Record<number, string> = {
    0: 'PENDING',
    1: 'CORRECT',
    2: 'WRONG-ANSWER',
    3: 'TIMELIMIT',
    4: 'MEMORY-LIMIT',
    5: 'OUTPUT-LIMIT',
    6: 'RUN-ERROR',
    7: 'COMPILER-ERROR',
    8: 'JUDGE-ERROR',
    9: 'CANCELLED',
    10: 'JUDGE-ERROR',
    11: 'WRONG-ANSWER',
    20: 'JUDGING',
    21: 'COMPILING',
    22: 'PENDING',
    30: 'IGNORED',
    31: 'FORMAT-ERROR',
};

export function score(tdoc: any, journal: Entry[], cutoff?: Date) {
    const details: Record<number, any> = {};
    const start = +tdoc.beginAt;
    const end = +tdoc.endAt;
    const seen = new Set<string>();
    const sorted = [...journal].sort((a, b) => a.rid.toHexString().localeCompare(b.rid.toHexString()));
    for (const entry of sorted) {
        const id = entry.rid.toHexString();
        const stamp = +entry.rid.getTimestamp();
        if (seen.has(id) || !tdoc.pids.includes(entry.pid) || stamp < start || stamp >= end) continue;
        seen.add(id);
        if (excludedStatuses.has(entry.status)) continue;
        const cell = (details[entry.pid] ||= { naccept: 0, npending: 0, attempts: 0, penalty: 0, real: 0 });
        if (cell.status === 1) continue;
        if (cutoff && stamp >= +cutoff) {
            cell.npending++;
            continue;
        }
        if (pendingStatuses.has(entry.status)) {
            cell.npending++;
            continue;
        }
        cell.attempts++;
        if (penalizedStatuses.has(entry.status)) cell.naccept++;
        Object.assign(cell, entry, {
            real: Math.floor((stamp - start) / 60000) * 60,
            penalty: cell.naccept * 20 * 60,
        });
        cell.time = cell.real + cell.penalty;
    }
    const accepted = Object.values(details).filter((cell) => cell.status === 1);
    return {
        accept: accepted.length,
        time: accepted.reduce((sum, cell) => sum + cell.time, 0),
        lastAccepted: Math.max(-1, ...accepted.map((cell) => cell.real)),
        detail: details,
    };
}

export function compare(a: any, b: any) {
    return (
        Number(!!a.unrank) - Number(!!b.unrank)
        || (b.accept || 0) - (a.accept || 0)
        || (a.time || 0) - (b.time || 0)
        || (a.lastAccepted ?? -1) - (b.lastAccepted ?? -1)
        || a.uid - b.uid
    );
}

export function ranked(rows: any[]) {
    const sorted = [...rows].sort(compare);
    let official = 0;
    let previous: any;
    let previousRank = 0;
    return sorted.map((row) => {
        if (row.unrank) return { ...row, rank: '*' };
        official++;
        const tied =
            previous
            && row.accept === previous.accept
            && row.time === previous.time
            && (row.lastAccepted ?? -1) === (previous.lastAccepted ?? -1);
        const rank = tied ? previousRank : official;
        previous = row;
        previousRank = rank;
        return { ...row, rank };
    });
}

export function stats(tdoc: any, journal: Entry[]) {
    const full = score(tdoc, journal);
    const frozen = tdoc.lockAt && !tdoc.unlocked && +tdoc.lockAt <= Date.now();
    const visible = frozen ? score(tdoc, journal, tdoc.lockAt) : full;
    return {
        accept: visible.accept,
        time: visible.time,
        lastAccepted: visible.lastAccepted,
        detail: full.detail,
        display: visible.detail,
        arenaFull: { accept: full.accept, time: full.time, lastAccepted: full.lastAccepted },
    };
}

/** Do not publish personal rating changes from a live, frozen or unfinished onsite result. */
export function ratingReady(tdoc: any, rows: any[], now = Date.now()) {
    const start = +tdoc.beginAt;
    const end = +tdoc.endAt;
    if (
        !Number.isFinite(start)
        || !Number.isFinite(end)
        || end <= start
        || now < end
        || (tdoc.lockAt && !tdoc.unlocked && +tdoc.lockAt <= now)
    ) { return false; }
    let submitted = false;
    for (const row of rows) {
        if (!row.attend || row.registrationCancelled) continue;
        for (const entry of row.journal || []) {
            const stamp = +entry?.rid?.getTimestamp?.();
            if (!Number.isFinite(stamp)) return false;
            if (!tdoc.pids.includes(entry.pid) || stamp < start || stamp >= end) continue;
            if (!Object.hasOwn(verdicts, entry.status) || pendingStatuses.has(entry.status)) return false;
            if (!row.unrank && !excludedStatuses.has(entry.status)) submitted = true;
        }
    }
    return submitted;
}

/** A rejudge resets the record before its final verdict replaces the journal entry. */
export function finalizedSnapshot(tdoc: any, rows: any[], records: any[]) {
    const entries = new Map<string, { pid: number, status: number, uid: number }>();
    const archived = new Set<string>();
    const members = new Set<number>();
    const hex = (id: any) => id?.toHexString?.() || String(id || '');
    const inWindow = (entry: any) => {
        const stamp = +(entry.rid || entry._id)?.getTimestamp?.();
        return Number.isFinite(stamp) && stamp >= +tdoc.beginAt && stamp < +tdoc.endAt && tdoc.pids.includes(entry.pid);
    };
    for (const row of rows) {
        const active = row.attend && !row.registrationCancelled;
        if (active) for (const uid of row.members?.length ? row.members : [row.uid]) members.add(uid);
        for (const entry of row.journal || []) {
            if (!inWindow(entry)) continue;
            const id = hex(entry.rid);
            if (!active) {
                archived.add(id);
                continue;
            }
            if (!Object.hasOwn(verdicts, entry.status) || pendingStatuses.has(entry.status)) return false;
            const previous = entries.get(id);
            if (previous && (previous.uid !== row.uid || previous.pid !== entry.pid || previous.status !== entry.status)) { return false; }
            entries.set(id, { uid: row.uid, pid: entry.pid, status: entry.status });
        }
    }
    const matched = new Set<string>();
    for (const record of records) {
        if (!inWindow(record)) continue;
        const id = hex(record._id);
        const entry = entries.get(id);
        if (entry) {
            if (entry.pid !== record.pid || entry.status !== record.status || pendingStatuses.has(record.status)) { return false; }
            matched.add(id);
        } else if (!archived.has(id) && members.has(record.uid)) {
            // A new submission may exist before its initial journal update commits.
            return false;
        }
    }
    return matched.size === entries.size;
}
