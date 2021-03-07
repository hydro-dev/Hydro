/* eslint-disable no-await-in-loop */
import cluster from 'cluster';
import type {
    Db, FilterQuery, ObjectID, OnlyFieldsOfType,
} from 'mongodb';
import { argv } from 'yargs';
import { Logger } from '../logger';
import type {
    Mdoc, Pdoc, Rdoc, TrainingDoc, User,
} from '../interface';
import type { DomainDoc } from '../loader';
import type { DocType } from '../model/document';

const _hooks: Record<keyof any, Array<(...args: any[]) => any>> = {};
const logger = new Logger('bus', true);

function isBailed(value: any) {
    return value !== null && value !== false && value !== undefined;
}

export type Disposable = () => void;
export type VoidReturn = Promise<any> | any;

export interface EventMap {
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
    'database/config': () => void

    'system/setting': (args: Record<string, any>) => VoidReturn

    'monitor/update': (type: 'server' | 'judger', $set: any) => VoidReturn

    'user/message': (uid: number, mdoc: Mdoc, udoc: User) => void
    'user/get': (udoc: User) => void

    'domain/create': (ddoc: DomainDoc) => VoidReturn
    'domain/before-get': (query: FilterQuery<DomainDoc>) => VoidReturn
    'domain/get': (ddoc: DomainDoc) => VoidReturn
    'domain/before-update': (domainId: string, $set: Partial<DomainDoc>) => VoidReturn
    'domain/update': (domainId: string, $set: Partial<DomainDoc>, ddoc: DomainDoc) => VoidReturn

    'document/add': (doc: any) => VoidReturn
    'document/set': <T extends keyof DocType>(
        domainId: string, docType: T, docId: DocType[T],
        $set: any, $unset: OnlyFieldsOfType<DocType[T], any, true | '' | 1>
    ) => VoidReturn

    'discussion/before-add': (
        domainId: string, parentType: number, parentId: ObjectID | number | string,
        owner: number, title: string, content: string,
        ip: string | null, highlight: boolean, pin: boolean
    ) => VoidReturn

    'problem/before-edit': (doc: Partial<Pdoc>) => VoidReturn
    'problem/edit': (doc: Pdoc) => VoidReturn
    'problem/list': (query: FilterQuery<Pdoc>, handler: any) => VoidReturn
    'problem/setting': (update: Partial<Pdoc>, handler: any) => VoidReturn
    'problem/get': (doc: Pdoc, handler: any) => VoidReturn
    'problem/delete': (domainId: string, docId: number) => VoidReturn

    'training/list': (query: FilterQuery<TrainingDoc>, handler: any) => VoidReturn
    'training/get': (tdoc: TrainingDoc, handler: any) => VoidReturn

    'record/change': (rdoc: Rdoc, $set?: any, $push?: any) => void
}

function getHooks<K extends keyof EventMap>(name: K) {
    const hooks = _hooks[name] || (_hooks[name] = []);
    if (hooks.length >= 128) {
        logger.warn(
            'max listener count (128) for event "%s" exceeded, which may be caused by a memory leak',
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
    if (argv.showBus) logger.debug('parallel: %s %o', name, args);
    for (const callback of _hooks[name] || []) {
        tasks.push(callback.apply(this, args));
    }
    await Promise.all(tasks);
}

export function emit<K extends keyof EventMap>(name: K, ...args: Parameters<EventMap[K]>) {
    return parallel(name, ...args);
}

export async function serial<K extends keyof EventMap>(name: K, ...args: Parameters<EventMap[K]>): Promise<void> {
    if (argv.showBus) logger.debug('serial: %s %o', name, args);
    const hooks = Array.from(_hooks[name] || []);
    for (const callback of hooks) {
        if (argv.busDetail) logger.debug(callback.toString());
        await callback.apply(this, args);
    }
}

export function bail<K extends keyof EventMap>(name: K, ...args: Parameters<EventMap[K]>): ReturnType<EventMap[K]> {
    if (argv.showBus) logger.debug('bail: %s %o', name, args);
    const hooks = Array.from(_hooks[name] || []);
    for (const callback of hooks) {
        const result = callback.apply(this, args);
        if (isBailed(result)) return result;
    }
    return null;
}

export function boardcast<K extends keyof EventMap>(event: K, ...payload: Parameters<EventMap[K]>) {
    // Process forked by pm2 would also have process.send
    if (process.send && !cluster.isMaster) {
        process.send({
            event: 'bus',
            eventName: event,
            payload,
        });
    } else parallel(event, ...payload);
}

async function messageHandler(worker: cluster.Worker, msg: any) {
    if (!msg) msg = worker;
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
    addListener, bail, boardcast, emit, on, off, once, parallel, prependListener, removeListener, serial,
};
