import { format, inspect, InspectOptions } from 'util';
import cac from 'cac';

const argv = cac().parse();

namespace Time {
    export const second = 1000;
    export const minute = second * 60;
    export const hour = minute * 60;
    export const day = hour * 24;
    export const week = day * 7;
    export function formatTimeShort(ms: number) {
        const abs = Math.abs(ms);
        if (abs >= day - hour / 2) {
            return `${Math.round(ms / day)}d`;
        } if (abs >= hour - minute / 2) {
            return `${Math.round(ms / hour)}h`;
        } if (abs >= minute - second / 2) {
            return `${Math.round(ms / minute)}m`;
        } if (abs >= second) {
            return `${Math.round(ms / second)}s`;
        }
        return `${ms}ms`;
    }
}

const colors = [
    20, 21, 26, 27, 32, 33, 38, 39, 40, 41, 42, 43, 44, 45, 56, 57, 62,
    63, 68, 69, 74, 75, 76, 77, 78, 79, 80, 81, 92, 93, 98, 99, 112, 113,
    129, 134, 135, 148, 149, 160, 161, 162, 163, 164, 165, 166, 167, 168,
    169, 170, 171, 172, 173, 178, 179, 184, 185, 196, 197, 198, 199, 200,
    201, 202, 203, 204, 205, 206, 207, 208, 209, 214, 215, 220, 221,
];

const instances: Record<string, Logger> = {};
type LogFunction = (format: any, ...param: any[]) => void;
type LogType = 'success' | 'error' | 'info' | 'warn' | 'debug';
export interface Logger extends Record<LogType, LogFunction> { }

export class Logger {
    static readonly SUCCESS = 1;
    static readonly ERROR = 1;
    static readonly INFO = 2;
    static readonly WARN = 2;
    static readonly DEBUG = 3;
    static baseLevel = argv.options.debug ? 3 : 2;
    static showDiff = false;
    static levels: Record<string, number> = {};
    static lastTime = 0;

    static options: InspectOptions = {
        colors: process.stderr.isTTY,
    };

    static formatters: Record<string, (this: Logger, value: any) => string> = {
        c: Logger.prototype.color,
        C: (value) => Logger.color(15, value, ';1'),
        o: (value) => inspect(value, Logger.options).replace(/\s*\n\s*/g, ' '),
    };

    static color(code: number, value: any, decoration = '') {
        if (!Logger.options.colors) return `${value}`;
        return `\u001B[3${code < 8 ? code : `8;5;${code}`}${decoration}m${value}\u001B[0m`;
    }

    private code: number;
    private displayName: string;
    public stream: NodeJS.WritableStream = process.stderr;

    constructor(public name: string, private showDiff = false) {
        if (name in instances) return instances[name];
        let hash = 0;
        for (let i = 0; i < name.length; i++) {
            hash = ((hash << 3) - hash) + name.charCodeAt(i);
            hash |= 0;
        }
        instances[name] = this;
        this.code = colors[Math.abs(hash) % colors.length];
        this.displayName = name ? this.color(`${name} `, ';1') : '';
        this.createMethod('success', '[S] ', Logger.SUCCESS);
        this.createMethod('error', '[E] ', Logger.ERROR);
        this.createMethod('info', '[I] ', Logger.INFO);
        this.createMethod('warn', '[W] ', Logger.WARN);
        this.createMethod('debug', '[D] ', Logger.DEBUG);
    }

    private color(value: any, decoration = '') {
        return Logger.color(this.code, value, decoration);
    }

    private createMethod(name: LogType, prefix: string, minLevel: number) {
        this[name] = (...args: [any, ...any[]]) => {
            if (this.level < minLevel) return;
            this.stream.write(`${prefix} ${this.displayName} ${this.format(...args)}\n`);
        };
    }

    get level() {
        return Logger.levels[this.name] ?? Logger.baseLevel;
    }

    extend = (namespace: string, showDiff = this.showDiff) => new Logger(`${this.name}:${namespace}`, showDiff);

    format: (format: any, ...param: any[]) => string = (...args) => {
        if (args[0] instanceof Error) args[0] = args[0].stack || args[0].message;
        else if (typeof args[0] !== 'string') args.unshift('%O');
        let index = 0;
        args[0] = (args[0] as string).replace(/%([a-zA-Z%])/g, (match, fmt) => {
            if (match === '%%') return '%';
            index += 1;
            const formatter = Logger.formatters[fmt];
            if (typeof formatter === 'function') {
                match = formatter.call(this, args[index]);
                args.splice(index, 1);
                index -= 1;
            }
            return match;
        }).split('\n').join('\n    ');
        if (Logger.showDiff || this.showDiff) {
            const now = Date.now();
            if (Logger.lastTime) {
                args.push(this.color(`+${Time.formatTimeShort(now - Logger.lastTime)}`));
            }
            Logger.lastTime = now;
        }
        return format(...args);
    };
}

export default new Logger('judge');
