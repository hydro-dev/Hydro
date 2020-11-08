import fs from 'fs-extra';
import path from 'path';
import { parse } from 'shell-quote';
import _ from 'lodash';
import { EventEmitter } from 'events';
import { FormatError } from './error';

const TIME_RE = /^([0-9]+(?:\.[0-9]*)?)([mu]?)s?$/i;
const TIME_UNITS = { '': 1000, m: 1, u: 0.001 };
const MEMORY_RE = /^([0-9]+(?:\.[0-9]*)?)([kmg])b?$/i;
const MEMORY_UNITS = { k: 0.1, m: 1, g: 1024 };
const EMPTY_STR = /^[ \r\n\t]*$/i;

export const cmd = parse;

export function noop() { }

export function parseTimeMS(str: string) {
    const match = TIME_RE.exec(str);
    if (!match) throw new FormatError(str, ['error parsing time']);
    return Math.floor(parseFloat(match[1]) * TIME_UNITS[match[2]]);
}

export function parseMemoryMB(str: string) {
    const match = MEMORY_RE.exec(str);
    if (!match) throw new FormatError(str, ['error parsing memory']);
    return Math.floor(parseFloat(match[1]) * MEMORY_UNITS[match[2]]);
}

export function sleep(timeout: number) {
    return new Promise((resolve) => {
        setTimeout(() => {
            resolve();
        }, timeout);
    });
}

export function parseFilename(filePath: string) {
    const t = filePath.split('/');
    return t[t.length - 1];
}

export class Queue<T> extends EventEmitter {
    queue: T[];

    waiting: any[];

    constructor() {
        super();
        this.queue = [];
        this.waiting = [];
    }

    get(count = 1) {
        if (this.empty() || this.queue.length < count) {
            return new Promise<T[]>((resolve) => {
                this.waiting.push({ count, resolve });
            });
        }
        const items = [];
        for (let i = 0; i < count; i++) { items.push(this.queue[i]); }
        this.queue = _.drop(this.queue, count);
        return items as T[];
    }

    empty() {
        return this.queue.length === 0;
    }

    push(value: T) {
        this.queue.push(value);
        if (this.waiting.length && this.waiting[0].count <= this.queue.length) {
            const items = [];
            for (let i = 0; i < this.waiting[0].count; i++) { items.push(this.queue[i]); }
            this.queue = _.drop(this.queue, this.waiting[0].count);
            this.waiting[0].resolve(items);
            this.waiting.shift();
        }
    }
}

export function compilerText(stdout: string, stderr: string) {
    const ret = [];
    if (!EMPTY_STR.test(stdout)) ret.push(stdout);
    if (!EMPTY_STR.test(stderr)) ret.push(stderr);
    return ret.join('\n');
}

export function copyInDir(dir: string) {
    const files = {};
    if (fs.existsSync(dir)) {
        fs.readdirSync(dir).forEach((f1) => {
            const p1 = `${dir}/${f1}`;
            if (fs.statSync(p1).isDirectory()) {
                fs.readdirSync(p1).forEach((f2) => {
                    files[`${f1}/${f2}`] = { src: `${dir}/${f1}/${f2}` };
                });
            } else files[f1] = { src: `${dir}/${f1}` };
        });
    }
    return files;
}

export function restrictFile(p: string) {
    if (!p) return '/';
    if (p[0] === '/') p = '';
    return p.replace(/\.\./gmi, '');
}

export function ensureFile(folder: string) {
    return (file: string, message: string) => {
        const f = path.join(folder, restrictFile(file));
        if (!fs.existsSync(f)) throw new FormatError(message + file);
        const stat = fs.statSync(f);
        if (!stat.isFile()) throw new FormatError(message + file);
        return f;
    };
}
