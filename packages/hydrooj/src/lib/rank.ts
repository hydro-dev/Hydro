import { Cursor } from 'mongodb';
import paginate from './paginate';

type G<T> = Promise<[[number, T], () => G<T>] | []>;
interface ranked {
    <T>(cursor: Cursor<T>, equ: (a: T, b: T) => boolean, page: number): Promise<[number, T][]>;
    iterate<T>(cursor: Cursor<T>, equ: (a: T, b: T) => boolean): G<T>;
    all<T>(cursor: Cursor<T>, equ: (a: T, b: T) => boolean): Promise<[number, T][]>;
}

const ranked: ranked = async function rankedPage(cursor, equ = (a, b) => a === b, page) {
    let last = null;
    let r = (page - 1) * 100;
    let count = r;
    const results = [];
    const [docs] = await paginate(cursor, page, 100);
    for (const doc of docs) {
        count++;
        if (count === 1 || !equ(last, doc)) r = count;
        last = doc;
        results.push([r, doc]);
    }
    return results;
};
ranked.iterate = async function rankedIterate<T>(cursor: Cursor<T>, equ = (a, b) => a === b) {
    let last = null;
    let r = 0;
    let count = 0;
    async function getNext(): G<T> {
        if (!await cursor.hasNext()) return [];
        const doc = await cursor.next();
        count++;
        if (count === 1 || !equ(last, doc)) r = count;
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
        if (count === 1 || !equ(last, doc)) r = count;
        last = doc;
        results.push([r, doc]);
    }
    return results;
};

global.Hydro.lib.rank = ranked;
export = ranked;
