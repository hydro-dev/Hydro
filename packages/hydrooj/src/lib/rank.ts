import { Cursor } from 'mongodb';

type ranked = <T>(cursor: Cursor<T>, equ: ((a: T, b: T) => boolean)) => Promise<[number, T][]>;

const ranked: ranked = async (cursor, equ) => {
    let last = null;
    let r = 0;
    let count = 0;
    const results = [];
    const docs = await cursor.toArray();
    for (const doc of docs) {
        count++;
        if (!last || !equ(last, doc)) r = count;
        if (doc.unrank) {
            results.push([0, doc]);
            continue;
        }
        last = doc;
        results.push([r, doc]);
    }
    return results;
};

global.Hydro.lib.rank = ranked;
export = ranked;
