function ranked<T>(diter: T[], equ = (a: T, b: T) => a === b): [number, T][] {
    let last = null;
    let r = 0;
    let count = 0;
    const results: [number, T][] = [];
    for (const doc of diter) {
        count++;
        if (count === 1 || !equ(last, doc)) r = count;
        last = doc;
        results.push([r, doc]);
    }
    return results;
}

global.Hydro.lib.rank = ranked;
export = ranked;
