/** Presentation data for the DOMjudge 9 scoreboard; scoring remains in scoring.ts. */
export const problemColors = [
    '#ff0000',
    '#8cff00',
    '#0062ff',
    '#8400ff',
    '#000000',
    '#a6fff9',
    '#f6ff00',
    '#00ffa2',
    '#00aeff',
    '#ff00d4',
];

export function safeLogo(value: unknown) {
    if (typeof value !== 'string' || value.length > 1000) return '';
    if (/^\/(?!\/)[^\s\\]*$/.test(value)) return value;
    try {
        const url = new URL(value);
        return url.protocol === 'https:' && !url.username && !url.password ? url.href : '';
    } catch {
        return '';
    }
}

export function medalCounts(value: any = {}) {
    const count = (key: string) =>
        Number.isSafeInteger(value?.[key]) && value[key] >= 0 && value[key] <= 10000 ? value[key] : 0;
    return { gold: count('gold'), silver: count('silver'), bronze: count('bronze') };
}

export function avatarImage(value: string, gravatar = false) {
    const normalized = value.startsWith('//') ? `https:${value}` : value.replace(/^http:\/\//i, 'https://');
    // Some legacy mirrors ignore d=404 and return a generic placeholder instead.
    if (gravatar) {
        const hash = normalized.match(/\/avatar\/([a-f0-9]{32})(?:[/?#]|$)/i)?.[1];
        return hash ? `https://www.gravatar.com/avatar/${hash}?d=404&s=64` : '/arena-assets/logo/hgnu-logo.png';
    }
    return safeLogo(normalized.replace(/([?&])d=mm(?=&|$)/g, '$1d=404')) || '/arena-assets/logo/hgnu-logo.png';
}

export function medalFor(row: any, medals: ReturnType<typeof medalCounts>) {
    if (!row.accept || row.unrank || typeof row.rank !== 'number') return '';
    let cutoff = 0;
    for (const kind of ['gold', 'silver', 'bronze'] as const) {
        cutoff += medals[kind];
        if (row.rank <= cutoff) return kind;
    }
    return '';
}

export function badgeTextColor(color: string) {
    const raw = color.replace('#', '');
    const rgb =
        (raw.length <= 4
            ? raw
                .slice(0, 3)
                .split('')
                .map((v) => v + v)
            : raw.match(/../g)?.slice(0, 3)) || [];
    const values = rgb.map((v) => Number.parseInt(v, 16));
    return (values[0] * 299 + values[1] * 587 + values[2] * 114) / 1000 >= 128 ? '#000000' : '#ffffff';
}

export function summarize(rows: any[], problemCount: number) {
    return Array.from({ length: problemCount }, (_, index) => {
        const cells = rows.map((row) => row.cells[index]);
        const solved = cells.filter((cell) => cell.correct);
        return {
            solved: solved.length,
            rejected: cells.reduce((sum, cell) => sum + cell.attempts, 0),
            pending: cells.reduce((sum, cell) => sum + cell.pending, 0),
            first: solved.length ? Math.min(...solved.map((cell) => cell.time)) : null,
        };
    });
}
