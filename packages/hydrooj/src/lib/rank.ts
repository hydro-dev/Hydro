import { Cursor } from 'mongodb';
import paginate from './paginate';

type G<T> = Promise<[[number, T], () => G<T>] | []>;
interface ranked {
    <T>(cursor: Cursor<T>, equ: (a: T, b: T) => boolean, page: number): Promise<[[number, T][], number]>;
    iterate<T>(cursor: Cursor<T>, equ: (a: T, b: T) => boolean): G<T>;
    all<T>(cursor: Cursor<T>, equ: (a: T, b: T) => boolean): Promise<[[number, T][], 1]>;
}

const ranked: ranked = async function rankedPage(cursor, equ = (a, b) => a === b, page) {
    if (!page) return await ranked.all(cursor, equ);
    let last = null;
    let r = (page - 1) * 100;
    let count = r;
    const results = [];
    const [docs, nPages] = await paginate(cursor, page, 100);
    for (const doc of docs) {
        count++;
        if (!last || !equ(last, doc)) r = count;
        last = doc;
        results.push([r, doc]);
    }
    return [results, nPages];
};
ranked.iterate = async function rankedIterate<T>(cursor: Cursor<T>, equ = (a, b) => a === b) {
    let last = null;
    let r = 0;
    let count = 0;
    async function getNext(): G<T> {
        if (!await cursor.hasNext()) return [];
        const doc = await cursor.next();
        count++;
        if (!last || !equ(last, doc)) r = count;
        last = doc;
        return [[r, doc], getNext];
    }
    return await getNext();
};
ranked.all = async function rankedAll(cursor, equ = (a, b) => a === b) {
    let last = null;
    let r = 0;
    let count = 0;
    const results = [];
    const docs = await cursor.toArray();
    for (const doc of docs) {
        count++;
        if (!last || !equ(last, doc)) r = count;
        last = doc;
        results.push([r, doc]);
    }
    return [results, 1];
};

global.Hydro.lib.rank = ranked;
export = ranked;
