import path from 'path';
import fs from 'fs-extra';
import os from 'os';
import { Duplex } from 'stream';
import { ObjectID } from 'mongodb';
import { isMoment } from 'moment';
import type { Moment } from 'moment-timezone';

declare global {
    interface StringConstructor {
        random: (digit?: number) => string;
    }
    interface String {
        format: (...args: Array<any>) => string;
        formatFromArray: (args: any[]) => string;
        rawformat: (object: any) => string;
    }
    interface ArrayConstructor {
        isDiff: (a: any[], b: any[]) => boolean;
    }
    interface Date {
        format: (fmt?: string) => string;
    }
    interface Math {
        sum: (...args: Array<number[] | number>) => number;
    }
    interface SetConstructor {
        isSuperset: (set: Set<any>, subset: Set<any>) => boolean;
        intersection: <T>(setA: Set<T>, setB: Set<T>) => Set<T>;
        union: <T>(setA: Set<T>, setB: Set<T>) => Set<T>;
    }
}

const defaultDict = 'abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ1234567890';

String.random = function random(digit = 32, dict = defaultDict) {
    let str = '';
    for (let i = 1; i <= digit; i++) str += dict[Math.floor(Math.random() * dict.length)];
    return str;
};

String.prototype.format = function formatStr(...args) {
    let result = this;
    if (args.length > 0) {
        if (args.length === 1 && typeof (args[0]) === 'object') {
            for (const key in args) {
                if (args[key] !== undefined) {
                    const reg = new RegExp(`(\\{${key}\\})`, 'g');
                    result = result.replace(reg, args[key]);
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

Array.isDiff = function isDiff(a, b) {
    if (a.length !== b.length) return true;
    a.sort();
    b.sort();
    for (const i in a) {
        if (a[i] !== b[i]) return true;
    }
    return false;
};

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

Set.union = function Union<T>(setA: Set<T>, setB: Set<T>) {
    const union = new Set(setA);
    for (const elem of setB) union.add(elem);
    return union;
};

Set.intersection = function Intersection<T>(setA: Set<T>, setB: Set<T>): Set<T> {
    const intersection = new Set();
    for (const elem of setB) {
        if (setA.has(elem)) intersection.add(elem);
    }
    // @ts-ignore
    return intersection;
};

export function folderSize(folderPath: string) {
    // eslint-disable-next-line @typescript-eslint/no-shadow
    let size = 0;
    const _next = function a(p: string) {
        if (p) {
            const stats = fs.statSync(p);
            if (!stats.isDirectory() || stats.isSymbolicLink()) {
                if (!stats.isSymbolicLink()) size += stats.size;
            } else {
                size += stats.size;
                const files = fs.readdirSync(p);
                if (Array.isArray(files)) {
                    files.forEach((file) => {
                        _next(path.join(p, file));
                    });
                }
            }
        }
    };
    _next(folderPath);
    return size;
}

const TIME_RE = /^([0-9]+(?:\.[0-9]*)?)([mu]?)s?$/i;
const TIME_UNITS = { '': 1000, m: 1, u: 0.001 };
const MEMORY_RE = /^([0-9]+(?:\.[0-9]*)?)([kmg])b?$/i;
const MEMORY_UNITS = { k: 1 / 1024, m: 1, g: 1024 };

export function parseTimeMS(str: string | number) {
    if (typeof str === 'number') return str;
    const match = TIME_RE.exec(str);
    if (!match) throw new Error(`${str} error parsing time`);
    return Math.floor(parseFloat(match[1]) * TIME_UNITS[match[2]]);
}

export function parseMemoryMB(str: string | number) {
    if (typeof str === 'number') return str;
    const match = MEMORY_RE.exec(str);
    if (!match) throw new Error(`${str} error parsing memory`);
    return Math.ceil(parseFloat(match[1]) * MEMORY_UNITS[match[2]]);
}

export function isClass(obj: any, strict = false) {
    if (typeof obj !== 'function') return false;
    const str = obj.toString();
    if (obj.prototype === undefined) return false;
    if (obj.prototype.constructor !== obj) return false;
    if (str.slice(0, 5) === 'class') return true;
    if (Object.getOwnPropertyNames(obj.prototype).length >= 2) return true;
    if (/^function\s+\(|^function\s+anonymous\(/.test(str)) return false;
    if (strict && /^function\s+[A-Z]/.test(str)) return true;
    if (/\b\(this\b|\bthis[.[]\b/.test(str)) {
        if (!strict || /classCallCheck\(this/.test(str)) return true;
        return /^function\sdefault_\d+\s*\(/.test(str);
    }
    return false;
}

export function streamToBuffer(stream: any, maxSize = 0): Promise<Buffer> {
    return new Promise((resolve, reject) => {
        const buffers = [];
        let length = 0;
        function onData(data) {
            buffers.push(data);
            length += data.length;
            if (maxSize && length > maxSize) {
                stream.removeListener('data', onData);
                reject(new Error('buffer length exceeded'));
            }
        }
        stream.on('error', reject);
        stream.on('data', onData);
        stream.on('end', () => resolve(Buffer.concat(buffers)));
    });
}

export function bufferToStream(buffer: Buffer): NodeJS.ReadableStream {
    const stream = new Duplex();
    stream.push(buffer);
    stream.push(null);
    return stream;
}

export function sleep(timeout: number) {
    return new Promise((resolve) => {
        setTimeout(resolve, timeout);
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

export namespace Time {
    export const second = 1000;
    export const minute = second * 60;
    export const hour = minute * 60;
    export const day = hour * 24;
    export const week = day * 7;
    export function formatTimeShort(ms: number) {
        const abs = Math.abs(ms);
        if (abs >= day - hour / 2) return `${Math.round(ms / day)}d`;
        if (abs >= hour - minute / 2) return `${Math.round(ms / hour)}h`;
        if (abs >= minute - second / 2) return `${Math.round(ms / minute)}m`;
        if (abs >= second) return `${Math.round(ms / second)}s`;
        return `${ms}ms`;
    }

    export function getObjectID(timestamp: string | Date | Moment) {
        let _timestamp: number;
        if (typeof timestamp === 'string') _timestamp = new Date(timestamp).getTime();
        else if (isMoment(timestamp)) _timestamp = timestamp.toDate().getTime();
        else _timestamp = timestamp.getTime();
        const hexSeconds = Math.floor(_timestamp / 1000).toString(16);
        const constructedObjectId = new ObjectID(`${hexSeconds}0000000000000000`);
        return constructedObjectId;
    }
}

export function errorMessage(err: Error | string) {
    const t = typeof err === 'string' ? err : err.stack;
    const parsed = t
        .replace(/[A-Z]:\\.+\\@hydrooj\\/g, '@hydrooj\\')
        .replace(/\/.+\/@hydrooj\//g, '\\')
        .replace(/[A-Z]:\\.+\\hydrooj\\/g, 'hydrooj\\')
        .replace(/\/.+\/hydrooj\//g, 'hydrooj/')
        .replace(/[A-Z]:\\.+\\node_modules\\/g, '')
        .replace(/\/.+\/node_modules\//g, '')
        .replace(/\\/g, '/');
    if (typeof err === 'string') return parsed;
    err.stack = parsed;
    return err;
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

function _digit2(number: number) {
    return number < 10 ? `0${number}` : number.toString();
}

export function formatSeconds(_seconds = '0') {
    const seconds = +_seconds;
    return '{0}:{1}:{2}'.format(
        _digit2(Math.floor(seconds / 3600)),
        _digit2(Math.floor((seconds % 3600) / 60)),
        _digit2(seconds % 60),
    );
}

export function changeErrorType(err: any, Err: any) {
    const e = new Err(err.message);
    e.stack = err.stack;
    if (err.params) e.params = err.params;
    return e;
}

export async function findFile(pathname: string, doThrow = true) {
    if (await fs.pathExists(path.resolve(pathname))) return path.resolve(pathname);
    if (await fs.pathExists(path.resolve(process.cwd(), pathname))) return path.resolve(process.cwd(), pathname);
    if (await fs.pathExists(path.resolve(__dirname, pathname))) return path.resolve(__dirname, pathname);
    try {
        return require.resolve(pathname);
    } catch (e) { }
    if (pathname.includes('/')) {
        const eles = pathname.split('/');
        let pkg = eles.shift();
        if (pkg.startsWith('@')) pkg = `${pkg}/${eles.shift()}`;
        const rest = eles.join('/');
        try {
            const p = path.dirname(require.resolve(path.join(pkg, 'package.json')));
            if (await fs.pathExists(path.resolve(p, rest))) return path.resolve(p, rest);
        } catch (e) { }
    }
    if (await fs.pathExists(path.resolve(os.homedir(), pathname))) return path.resolve(os.homedir(), pathname);
    if (await fs.pathExists(path.resolve(os.homedir(), '.hydro', pathname))) return path.resolve(os.homedir(), '.hydro', pathname);
    // eslint-disable-next-line max-len
    if (await fs.pathExists(path.resolve(os.homedir(), '.config', 'hydro', pathname))) return path.resolve(os.homedir(), '.config', 'hydro', pathname);
    if (doThrow) throw new Error(`File ${pathname} not found`);
    return null;
}

export function findFileSync(pathname: string, doThrow = true) {
    if (fs.pathExistsSync(path.resolve(pathname))) return path.resolve(pathname);
    if (fs.pathExistsSync(path.resolve(process.cwd(), pathname))) return path.resolve(process.cwd(), pathname);
    if (fs.pathExistsSync(path.resolve(__dirname, pathname))) return path.resolve(__dirname, pathname);
    try {
        return require.resolve(pathname);
    } catch (e) { }
    if (pathname.includes('/')) {
        const eles = pathname.split('/');
        let pkg = eles.shift();
        if (pkg.startsWith('@')) pkg = `${pkg}/${eles.shift()}`;
        const rest = eles.join('/');
        try {
            const p = path.dirname(require.resolve(path.join(pkg, 'package.json')));
            if (fs.statSync(path.resolve(p, rest))) return path.resolve(p, rest);
        } catch (e) { }
    }
    if (fs.pathExistsSync(path.resolve(os.homedir(), pathname))) return path.resolve(os.homedir(), pathname);
    if (fs.pathExistsSync(path.resolve(os.homedir(), '.hydro', pathname))) return path.resolve(os.homedir(), '.hydro', pathname);
    if (fs.pathExistsSync(path.resolve(os.homedir(), '.config', 'hydro', pathname))) return path.resolve(os.homedir(), '.config', 'hydro', pathname);
    if (doThrow) throw new Error(`File ${pathname} not found`);
    return null;
}

export async function retry(func: Function, ...args: any[]): Promise<any>;
export async function retry(times: number, func: Function, ...args: any[]): Promise<any>;
// eslint-disable-next-line consistent-return
export async function retry(arg0: number | Function, func: any, ...args: any[]) {
    let res;
    if (typeof arg0 !== 'number') {
        args = [func, ...args];
        func = arg0;
        arg0 = 3;
    }
    for (let i = 1; i <= arg0; i++) {
        try {
            // eslint-disable-next-line no-await-in-loop
            res = await func(...args);
        } catch (e) {
            if (i === arg0) throw e;
            continue;
        }
        return res;
    }
}

export function CallableInstance(property = '__call__') {
    let func;
    if (typeof property === 'function') func = property;
    else func = this.constructor.prototype[property];
    const apply = function __call__(...args) { return func.apply(apply, ...args); };
    Object.setPrototypeOf(apply, this.constructor.prototype);
    Object.getOwnPropertyNames(func).forEach((p) => {
        Object.defineProperty(apply, p, Object.getOwnPropertyDescriptor(func, p));
    });
    return apply;
}

CallableInstance.prototype = Object.create(Function.prototype);

const fSortR = /[^\d]+|\d+/g;
export function sortFiles(files: { _id: string }[] | string[]) {
    if (!files?.length) return [];
    const isString = typeof files[0] === 'string';
    const result = files
        .map((i) => (isString ? { name: i, weights: i.match(fSortR) } : { ...i, weights: i._id.match(fSortR) }))
        .sort((a, b) => {
            let pos = 0;
            const weightsA = a.weights;
            const weightsB = b.weights;
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
    return isString ? result.map((x) => x.name) : result;
}
