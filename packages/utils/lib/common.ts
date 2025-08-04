declare global {
    interface String {
        format: (...args: Array<any>) => string;
        formatFromArray: (args: any[]) => string;
        rawformat: (object: any) => string;
    }
    interface Math {
        sum: (...args: Array<number[] | number>) => number;
    }
    interface SetConstructor {
        isSuperset: (set: Set<any>, subset: Set<any> | Array<any>) => boolean;
        intersection: <T>(setA: Set<T> | Array<T>, setB: Set<T> | Array<T>) => Set<T>;
        union: <T>(setA: Set<T> | Array<T>, setB: Set<T> | Array<T>) => Set<T>;
    }
}

const defaultDict = 'abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ1234567890';

export function randomstring(digit = 32, dict = defaultDict) {
    let str = '';
    for (let i = 1; i <= digit; i++) str += dict[Math.floor(Math.random() * dict.length)];
    return str;
}
try {
    // @ts-ignore
    String.random = randomstring;
} catch (e) { } // Cannot add property random, object is not extensible

String.prototype.format ||= function formatStr(...args) {
    let result = this;
    if (args.length) {
        if (args.length === 1 && typeof args[0] === 'object') {
            const t = args[0];
            for (const key in t) {
                if (!key.startsWith('_') && t[key] !== undefined) {
                    const reg = new RegExp(`(\\{${key}\\})`, 'g');
                    result = result.replace(reg, t[key]);
                }
            }
        } else return this.formatFromArray(args);
    }
    return result;
};

String.prototype.formatFromArray = function formatStr(args) {
    let result = this;
    for (let i = 0; i < args.length; i++) {
        if (args[i] !== undefined) {
            const reg = new RegExp(`(\\{)${i}(\\})`, 'g');
            result = result.replace(reg, args[i]);
        }
    }
    return result;
};

String.prototype.rawformat = function rawFormat(object) {
    const res = this.split('{@}');
    return [res[0], object, res[1]].join();
};

export function diffArray(a, b) {
    if (a.length !== b.length) return true;
    a.sort();
    b.sort();
    for (const i in a) {
        if (a[i] !== b[i]) return true;
    }
    return false;
}

try {
    // @ts-ignore
    Array.isDiff = diffArray;
} catch (e) { } // Cannot add property isDiff, object is not extensible

// @ts-ignore
Date.prototype.format = function formatDate(fmt = '%Y-%m-%d %H:%M:%S') {
    let m = this.getMonth() + 1;
    if (m < 10) m = `0${m}`;
    let d = this.getDate();
    if (d < 10) d = `0${d}`;
    let H = this.getHours();
    if (H < 10) H = `0${H}`;
    let M = this.getMinutes();
    if (M < 10) M = `0${M}`;
    let S = this.getSeconds();
    if (S < 10) S = `0${S}`;
    return fmt
        .replace('%Y', this.getFullYear())
        .replace('%m', m)
        .replace('%d', d)
        .replace('%H', H)
        .replace('%M', M)
        .replace('%S', S);
};

Math.sum = function sum(...args) {
    let s = 0;
    for (const i of args) {
        if (i instanceof Array) {
            for (const j of i) {
                s += j;
            }
        } else s += i;
    }
    return s;
};

Set.isSuperset = function isSuperset(set, subset) {
    for (const elem of subset) {
        if (!set.has(elem)) return false;
    }
    return true;
};

Set.union = function Union<T>(setA: Set<T> | Array<T>, setB: Set<T> | Array<T>) {
    const union = new Set(setA);
    for (const elem of setB) union.add(elem);
    return union;
};

Set.intersection = function Intersection<T>(A: Set<T> | Array<T> = [], B: Set<T> | Array<T> = []) {
    const intersection = new Set<T>();
    if (A instanceof Array) A = new Set(A);
    if (B instanceof Array) B = new Set(B);
    for (const elem of B) if (A.has(elem)) intersection.add(elem);
    return intersection;
};

export function sleep(timeout: number) {
    return new Promise((resolve) => {
        setTimeout(() => resolve(true), timeout);
    });
}

function deepen(modifyString: (source: string) => string) {
    function modifyObject<T>(source: T): T {
        if (typeof source !== 'object' || !source) return source;
        if (Array.isArray(source)) return source.map(modifyObject) as any;
        const result = {} as T;
        for (const key in source) {
            result[modifyString(key)] = modifyObject(source[key]);
        }
        return result;
    }

    return function t<T>(source: T): T {
        if (typeof source === 'string') return modifyString(source) as any;
        return modifyObject(source);
    };
}

export function noop() { }

export const camelCase = deepen((source) => source.replace(/[_-][a-z]/g, (str) => str.slice(1).toUpperCase()));
export const paramCase = deepen((source) => source.replace(/_/g, '-').replace(/(?<!^)[A-Z]/g, (str) => `-${str.toLowerCase()}`));
export const snakeCase = deepen((source) => source.replace(/-/g, '_').replace(/(?<!^)[A-Z]/g, (str) => `_${str.toLowerCase()}`));

const TIME_RE = /^([0-9]+(?:\.[0-9]*)?)([mu]?)s?$/i;
const TIME_UNITS = { '': 1000, m: 1, u: 0.001 };
const MEMORY_RE = /^([0-9]+(?:\.[0-9]*)?)([kmg])b?$/i;
const MEMORY_UNITS = { k: 1 / 1024, m: 1, g: 1024 };

export function parseTimeMS(str: string | number, throwOnError = true) {
    if (typeof str === 'number' || Number.isSafeInteger(+str)) return +str;
    const match = TIME_RE.exec(str);
    if (!match && throwOnError) throw new Error(`${str} error parsing time`);
    if (!match) return 1000;
    return Math.floor(Number.parseFloat(match[1]) * TIME_UNITS[match[2].toLowerCase()]);
}

export function parseMemoryMB(str: string | number, throwOnError = true) {
    if (typeof str === 'number' || Number.isSafeInteger(+str)) return +str;
    const match = MEMORY_RE.exec(str);
    if (!match && throwOnError) throw new Error(`${str} error parsing memory`);
    if (!match) return 256;
    return Math.ceil(Number.parseFloat(match[1]) * MEMORY_UNITS[match[2].toLowerCase()]);
}

function _digit2(number: number) {
    return number < 10 ? `0${number}` : number.toString();
}

export function formatSeconds(_seconds: string | number = '0', showSeconds = true) {
    const seconds = +_seconds;
    let res = '{0}:{1}'.format(
        showSeconds ? _digit2(Math.floor(seconds / 3600)) : Math.floor(seconds / 3600),
        _digit2(Math.floor((seconds % 3600) / 60)),
    );
    if (showSeconds) res += `:${_digit2(seconds % 60)}`;
    return res;
}

export function size(s: number, base = 1) {
    s *= base;
    const unit = 1024;
    const unitNames = ['Bytes', 'KiB', 'MiB', 'GiB', 'TiB', 'PiB', 'EiB', 'ZiB', 'YiB'];
    for (const unitName of unitNames) {
        if (s < unit) return '{0} {1}'.format(Math.round(s * 10) / 10, unitName);
        s /= unit;
    }
    return `${Math.round(s * unit)} ${unitNames[unitNames.length - 1]}`;
}

export function randomPick<T>(arr: T[]): T {
    return arr[Math.floor(Math.random() * arr.length)];
}

export type StringKeys<O> = {
    [K in keyof O]: string extends O[K] ? K : never
}[keyof O];
const fSortR = /\D+|\d+/g;
export function sortFiles(files: string[]): string[];
export function sortFiles<T extends { _id: string }>(files: T[], key?: '_id'): T[];
export function sortFiles<T extends Record<string, any>>(files: T[], key: StringKeys<T>): T[];
export function sortFiles(files: Record<string, any>[] | string[], key = '_id') {
    if (!files?.length) return [];
    const isString = typeof files[0] === 'string';
    const result = files
        .map((i) => (isString ? { name: i, _weights: i.match(fSortR) } : { ...i, _weights: (i[key] || i.name).match(fSortR) }))
        .sort((a, b) => {
            let pos = 0;
            const weightsA = a._weights;
            const weightsB = b._weights;
            let weightA = weightsA[pos];
            let weightB = weightsB[pos];
            while (weightA && weightB) {
                const v = weightA - weightB;
                if (!Number.isNaN(v) && v !== 0) return v;
                if (weightA !== weightB) return weightA > weightB ? 1 : -1;
                pos += 1;
                weightA = weightsA[pos];
                weightB = weightsB[pos];
            }
            return weightA ? 1 : -1;
        });
    return result.map((x) => (isString ? x.name : (delete x._weights && x)));
}

export const getAlphabeticId = (() => {
    // A...Z, AA...AZ, BA...BZ, ...
    const f = (a: number) => (a < 0 ? '' : f(a / 26 - 1) + String.fromCharCode((a % 26) + 65)) as string;
    const alphabet = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ';
    const cache = alphabet.split('');
    for (const ch of alphabet) cache.push(...alphabet.split('').map((c) => ch + c));
    return (i: number) => cache[i] || (i < 0 ? '?' : f(i));
})();
