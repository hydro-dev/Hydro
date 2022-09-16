import { Cursor } from 'mongodb';
import paginate from './paginate';

type ranked = <T>(cursor: Cursor<T>, equ: ((a: T, b: T) => boolean), page?: number) => Promise<[[number, T][], number]>;

const ranked: ranked = async (cursor, equ, page) => {
    let last = null;
    let r = page ? (page - 1) * 100 : 0;
    let count = page ? r : 0;
    const results = [];
    const [docs, nPages] = page ? await paginate(cursor, page, 100) : [await cursor.toArray(), 1];
    for (const doc of docs) {
        count++;
        if (!last || !equ(last, doc)) r = count;
        last = doc;
        results.push([r, doc]);
    }
    return [results, nPages];
};

global.Hydro.lib.rank = ranked;
export = ranked;
