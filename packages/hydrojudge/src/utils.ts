import path from 'path';
import { parse } from 'shell-quote';
import { fs } from '@hydrooj/utils';
import { FormatError } from './error';

const EMPTY_STR = /^[ \r\n\t]*$/i;

export const cmd = parse;

export namespace Lock {
    const queue: Record<string, Array<(res?: any) => void>> = {};

    export async function acquire(key: string) {
        if (!queue[key]) {
            queue[key] = [];
        } else {
            await new Promise((resolve) => {
                queue[key].push(resolve);
            });
        }
    }

    export function release(key: string) {
        if (!queue[key].length) delete queue[key];
        else queue[key].shift()();
    }
}

export function compilerText(stdout: string, stderr: string) {
    const ret = [];
    if (!EMPTY_STR.test(stdout)) ret.push(stdout.substring(0, 1024 * 1024));
    if (!EMPTY_STR.test(stderr)) ret.push(stderr.substring(0, 1024 * 1024));
    return ret.join('\n');
}

function restrictFile(p: string) {
    if (!p) return '/';
    if (p[0] === '/') p = '';
    return p.replace(/\.\./gmi, '');
}

export function ensureFile(folder: string) {
    return (file: string, message: string) => {
        if (file === '/dev/null') return file;
        // Historical issue
        if (file.includes('/')) {
            const f = path.join(folder, restrictFile(file.split('/')[1]));
            if (fs.existsSync(f)) {
                const stat = fs.statSync(f);
                if (stat.isFile()) return f;
            }
        }
        const f = path.join(folder, restrictFile(file));
        if (!fs.existsSync(f)) throw new FormatError(message, [file]);
        const stat = fs.statSync(f);
        if (!stat.isFile()) throw new FormatError(message, [file]);
        return f;
    };
}

export * from '@hydrooj/utils/lib/utils';
