/** Use the same language intersections and parsed limits as native submissions. */
export function allowedLanguageIds(languages: Record<string, any>, ...restrictions: (string[] | undefined)[]) {
    const limits = restrictions.filter((value): value is string[] => Array.isArray(value));
    const explicit = limits.some((value) => value.length);
    return Object.keys(languages).filter(
        (key) =>
            key !== '_'
            && !languages[key].disabled
            && !languages[key].remote
            && (explicit || !languages[key].hidden)
            && limits.every((value) => value.includes(key)),
    );
}

export function problemLimits(config: any) {
    const range = (min: number, max: number, scale: number, unit: string) => {
        if (!Number.isFinite(min) || !Number.isFinite(max) || min <= 0 || max < min) return '—';
        const format = (value: number) => String(Number((value / scale).toFixed(3)));
        return `${format(min)}${min === max ? '' : `–${format(max)}`}${unit}`;
    };
    return {
        time: range(config.timeMin, config.timeMax, 1000, 's'),
        memory: range(config.memoryMin, config.memoryMax, 1, ' MiB'),
    };
}

/** An explicit selection takes priority over the legacy filename convention. */
export function statementPdf<T extends { name: string }>(files: T[], selected?: string): T | undefined {
    const pdfs = files.filter((file) => /\.pdf$/i.test(file.name));
    if (selected !== undefined) return pdfs.find((file) => file.name === selected);
    return pdfs.find((file) => file.name.toLowerCase() === 'statement.pdf')
        || (pdfs.length === 1 ? pdfs[0] : undefined);
}
