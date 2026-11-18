const DAY = 24 * 60 * 60 * 1000;
const BEIJING_OFFSET = 8 * 60 * 60 * 1000;

export interface FirstPass {
    problem: string;
    at: Date;
}

export interface ActivitySource {
    id: string;
    solves?: FirstPass[];
    through?: Date;
}

export function beijingDay(at: Date) {
    return new Date(at.getTime() + BEIJING_OFFSET).toISOString().slice(0, 10);
}

export function nextBeijingNoon(at: Date) {
    const today = Date.parse(`${beijingDay(at)}T12:00:00+08:00`);
    return new Date(today > at.getTime() ? today : today + DAY);
}

export function firstPasses(solves: FirstPass[]) {
    const earliest = new Map<string, Date>();
    for (const { problem, at } of solves) {
        if (!problem || !Number.isFinite(at?.getTime())) continue;
        const old = earliest.get(problem);
        if (!old || at < old) earliest.set(problem, at);
    }
    return [...earliest].map(([problem, at]) => ({ problem, at }));
}

export function buildDailyActivity(sources: ActivitySource[], now = new Date(), days = 365) {
    const countsBySource = sources.map(({ solves, through }) => {
        if (!solves) return null;
        const counts = new Map<string, number>();
        for (const { at } of firstPasses(solves)) {
            const day = beijingDay(at);
            counts.set(day, (counts.get(day) || 0) + 1);
        }
        return { counts, through: through && beijingDay(through) };
    });
    return Array.from({ length: days }, (_, i) => {
        const day = beijingDay(new Date(now.getTime() - (days - 1 - i) * DAY));
        const counts = countsBySource.map((source) => (
            source && (!source.through || day <= source.through) ? source.counts.get(day) || 0 : null
        ));
        return {
            day,
            counts,
            total: counts.some((n) => n !== null) ? counts.reduce<number>((acc, n) => acc + (n || 0), 0) : null,
        };
    });
}

export function syncState(binding?: { lastSuccessAt?: Date, failedAt?: Date }) {
    if (!binding) return 'unbound';
    if (binding.failedAt && (!binding.lastSuccessAt || binding.failedAt >= binding.lastSuccessAt)) return 'failed';
    if (binding.lastSuccessAt) return 'success';
    return 'pending';
}
