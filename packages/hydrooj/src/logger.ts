import { inspect, format } from 'util';
import { argv } from 'yargs';
import { Time } from './utils';

const instances: Record<string, Logger> = {};
type LogFunction = (format: any, ...param: any[]) => boolean;
type LogType = 'success' | 'error' | 'info' | 'warn' | 'debug';
export interface Logger extends Record<LogType, LogFunction> { }
export class Logger {
    static readonly SUCCESS = 1;
    static readonly ERROR = 1;
    static readonly INFO = 2;
    static readonly WARN = 2;
    static readonly DEBUG = 3;
    static baseLevel = argv.debug ? 3 : 2;
    static showDiff = false;
    static levels: Record<string, number> = {};
    static lastTime = 0;
    static formatters: Record<string, (this: Logger, value: any) => string> = {
        o: (value) => inspect(value).replace(/\s*\n\s*/g, ' '),
    };

    constructor(public name: string, private showDiff = false) {
        if (name in instances) return instances[name];
        let hash = 0;
        for (let i = 0; i < name.length; i++) {
            hash = ((hash << 3) - hash) + name.charCodeAt(i);
            hash |= 0;
        }
        instances[name] = this;
        this.createMethod('success', '[S] ', Logger.SUCCESS);
        this.createMethod('error', '[E] ', Logger.ERROR);
        this.createMethod('info', '[I] ', Logger.INFO);
        this.createMethod('warn', '[W] ', Logger.WARN);
        this.createMethod('debug', '[D] ', Logger.DEBUG);
    }

    private createMethod(name: LogType, prefix: string, minLevel: number) {
        this[name] = (...args: [any, ...any[]]) => {
            if (this.level < minLevel) return false;
            const msg = `${prefix} ${this.name} ${this.format(...args)}`;
            if (process.send) process.send({ event: 'message/log', payload: [msg] });
            else global.Hydro.service.bus.parallel('message/log', msg);
            return true;
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
            if (Logger.lastTime) args.push(`+${Time.formatTimeShort(now - Logger.lastTime)}`);
            Logger.lastTime = now;
        }
        return format(...args);
    };
}

global.Hydro.Logger = Logger;
export const logger = new Logger('*');
global.Hydro.logger = logger;
