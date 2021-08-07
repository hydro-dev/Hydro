/* eslint-disable no-await-in-loop */
import cluster, { Worker } from 'cluster';
import serialize from 'serialize-javascript';
import cac from 'cac';
import type {
    Db, FilterQuery, ObjectID, OnlyFieldsOfType,
} from 'mongodb';
import type { Handler } from './server';
import { Logger } from '../logger';
import type {
    MessageDoc, ProblemDoc, RecordDoc,
    TrainingDoc, User, DiscussionDoc,
    DomainDoc, FileInfo, Tdoc,
} from '../interface';
import type { DocType } from '../model/document';
import type { ProblemSolutionHandler } from '../handler/problem';
import type { UserRegisterHandler } from '../handler/user';

const _hooks: Record<keyof any, Array<(...args: any[]) => any>> = {};
const logger = new Logger('bus', true);
const argv = cac().parse();

function isBailed(value: any) {
    return value !== null && value !== false && value !== undefined;
}

export type Disposable = () => void;
export type VoidReturn = Promise<any> | any;

export interface EventMap extends Record<string, any> {
    'app/started': () => void
    'app/load/lib': () => VoidReturn
    'app/load/locale': () => VoidReturn
    'app/load/template': () => VoidReturn
    'app/load/script': () => VoidReturn
    'app/load/setting': () => VoidReturn
    'app/load/model': () => VoidReturn
    'app/load/handler': () => VoidReturn
    'app/load/service': () => VoidReturn
    'app/exit': () => VoidReturn

    'message/log': (message: string) => VoidReturn
    'message/reload': (count: number) => VoidReturn
    'message/run': (command: string) => VoidReturn

    'database/connect': (db: Db) => void
    'database/config': () => VoidReturn

    'system/setting': (args: Record<string, any>) => VoidReturn

    'monitor/update': (type: 'server' | 'judge', $set: any) => VoidReturn

    'user/message': (uid: number, mdoc: MessageDoc) => void
    'user/get': (udoc: User) => void

    'domain/create': (ddoc: DomainDoc) => VoidReturn
    'domain/before-get': (query: FilterQuery<DomainDoc>) => VoidReturn
    'domain/get': (ddoc: DomainDoc) => VoidReturn
    'domain/before-update': (domainId: string, $set: Partial<DomainDoc>) => VoidReturn
    'domain/update': (domainId: string, $set: Partial<DomainDoc>, ddoc: DomainDoc) => VoidReturn
    'domain/delete': (domainId: string) => VoidReturn

    'document/add': (doc: any) => VoidReturn
    'document/set': <T extends keyof DocType>(
        domainId: string, docType: T, docId: DocType[T],
        $set: any, $unset: OnlyFieldsOfType<DocType[T], any, true | '' | 1>
    ) => VoidReturn

    'handler/create': (thisArg: Handler) => VoidReturn
    'handler/init': (thisArg: Handler) => VoidReturn
    'handler/before-prepare/UserRegister': (thisArg: UserRegisterHandler) => VoidReturn
    'handler/before/UserRegister': (thisArg: UserRegisterHandler) => VoidReturn
    'handler/after/UserRegister': (thisArg: UserRegisterHandler) => VoidReturn
    'handler/finish/UserRegister': (thisArg: UserRegisterHandler) => VoidReturn
    'handler/solution/get': (thisArg: ProblemSolutionHandler) => VoidReturn

    'discussion/before-add': (payload: Partial<DiscussionDoc>) => VoidReturn
    'discussion/add': (payload: Partial<DiscussionDoc>) => VoidReturn

    'problem/before-add': (domainId: string, content: string, owner: number, docId: number, doc: Partial<ProblemDoc>) => VoidReturn
    'problem/add': (doc: Partial<ProblemDoc>, docId: number) => VoidReturn
    'problem/before-edit': (doc: Partial<ProblemDoc>) => VoidReturn
    'problem/edit': (doc: ProblemDoc) => VoidReturn
    'problem/before-del': (domainId: string, docId: number) => VoidReturn
    'problem/del': (domainId: string, docId: number) => VoidReturn
    'problem/list': (query: FilterQuery<ProblemDoc>, handler: any) => VoidReturn
    'problem/get': (doc: ProblemDoc, handler: any) => VoidReturn
    'problem/delete': (domainId: string, docId: number) => VoidReturn
    'problem/addTestdata': (domainId: string, docId: number, name: string, payload: Omit<FileInfo, '_id'>) => VoidReturn
    'problem/delTestdata': (domainId: string, docId: number, name: string[]) => VoidReturn
    'problem/addAdditionalFile': (domainId: string, docId: number, name: string, payload: Omit<FileInfo, '_id'>) => VoidReturn
    'problem/delAdditionalFile': (domainId: string, docId: number, name: string[]) => VoidReturn

    'contest/before-add': (payload: Partial<Tdoc>) => VoidReturn
    'contest/add': (payload: Partial<Tdoc>, id: ObjectID) => VoidReturn

    'training/list': (query: FilterQuery<TrainingDoc>, handler: any) => VoidReturn
    'training/get': (tdoc: TrainingDoc, handler: any) => VoidReturn

    'record/change': (rdoc: RecordDoc, $set?: any, $push?: any) => void
    'record/judge': (rdoc: RecordDoc, updated: boolean) => VoidReturn
}

function getHooks<K extends keyof EventMap>(name: K) {
    const hooks = _hooks[name] || (_hooks[name] = []);
    if (hooks.length >= 2048) {
        logger.warn(
            'max listener count (2048) for event "%s" exceeded, which may be caused by a memory leak',
            name,
        );
    }
    return hooks;
}

export function removeListener<K extends keyof EventMap>(name: K, listener: EventMap[K]) {
    const index = (_hooks[name] || []).findIndex((callback) => callback === listener);
    if (index >= 0) {
        _hooks[name].splice(index, 1);
        return true;
    }
    return false;
}

export function addListener<K extends keyof EventMap>(name: K, listener: EventMap[K]) {
    getHooks(name).push(listener);
    return () => removeListener(name, listener);
}

export function prependListener<K extends keyof EventMap>(name: K, listener: EventMap[K]) {
    getHooks(name).unshift(listener);
    return () => removeListener(name, listener);
}

export function once<K extends keyof EventMap>(name: K, listener: EventMap[K]) {
    let dispose;
    function _listener(...args: any[]) {
        dispose();
        return listener.apply(this, args);
    }
    _listener.toString = () => `// Once \n${listener.toString()}`;
    dispose = addListener(name, _listener);
    return dispose;
}

export function on<K extends keyof EventMap>(name: K, listener: EventMap[K]) {
    return addListener(name, listener);
}

export function off<K extends keyof EventMap>(name: K, listener: EventMap[K]) {
    return removeListener(name, listener);
}

export async function parallel<K extends keyof EventMap>(name: K, ...args: Parameters<EventMap[K]>): Promise<void> {
    const tasks: Promise<any>[] = [];
    if (argv.options.showBus && name !== 'message/log') logger.debug('parallel: %s %o', name, args);
    for (const callback of _hooks[name] || []) {
        if (argv.options.busDetail && name !== 'message/log') logger.debug(callback.toString());
        tasks.push(callback.apply(this, args));
    }
    await Promise.all(tasks);
}

export function emit<K extends keyof EventMap>(name: K, ...args: Parameters<EventMap[K]>) {
    return parallel(name, ...args);
}

export async function serial<K extends keyof EventMap>(name: K, ...args: Parameters<EventMap[K]>): Promise<void> {
    if (argv.options.showBus && name !== 'message/log') logger.debug('serial: %s %o', name, args);
    const hooks = Array.from(_hooks[name] || []);
    for (const callback of hooks) {
        if (argv.options.busDetail) logger.debug(callback.toString());
        await callback.apply(this, args);
    }
}

export async function bail<K extends keyof EventMap>(name: K, ...args: Parameters<EventMap[K]>): Promise<ReturnType<EventMap[K]>> {
    if (argv.options.showBus && name !== 'message/log') logger.debug('bail: %s %o', name, args);
    const hooks = Array.from(_hooks[name] || []);
    for (const callback of hooks) {
        let result = callback.apply(this, args);
        if (result instanceof Promise) result = await result;
        if (isBailed(result)) return result;
    }
    return null;
}

export function broadcast<K extends keyof EventMap>(event: K, ...payload: Parameters<EventMap[K]>) {
    // Process forked by pm2 would also have process.send
    if (process.send && !cluster.isMaster) {
        process.send({
            event: 'bus',
            eventName: event,
            payload: serialize(payload),
        });
    } else parallel(event, ...payload);
}

async function messageHandler(worker: Worker, msg: any) {
    if (!msg) msg = worker;
    // eslint-disable-next-line no-eval
    if (typeof msg.payload === 'string') msg.payload = eval(msg.payload);
    if (msg.event) {
        if (msg.event === 'bus') {
            if (cluster.isMaster) {
                for (const i in cluster.workers) {
                    cluster.workers[i].send(msg);
                }
            }
            emit(msg.eventName, ...msg.payload);
        } else if (msg.event === 'stat') {
            global.Hydro.stat.reqCount += msg.count;
        } else await emit(msg.event, ...msg.payload);
    }
}

process.on('message', messageHandler);
cluster.on('message', messageHandler);

global.Hydro.service.bus = {
    addListener, bail, broadcast, emit, on, off, once, parallel, prependListener, removeListener, serial,
};
