/* eslint-disable no-await-in-loop */
import cluster from 'cluster';
import { Db, ObjectID } from 'mongodb';
import { Mdoc, Rdoc, User } from '../interface';

const _hooks: Record<keyof any, Array<(...args: any[]) => any>> = {};
const _disposables = [];

function isBailed(value: any) {
    return value !== null && value !== false && value !== undefined;
}

export type Disposable = () => void

interface EventMap {
    'app/started': () => void
    'app/exit': () => Promise<void> | void
    'dispose': () => void

    'database/connect': (db: Db) => void

    'user/message': (uid: number, mdoc: Mdoc, udoc: User) => void

    'document/add': (doc: any) => Promise<string | void> | string | void
    'document/set': (domainId: string, docType: number, docId: ObjectID | string | number, args: any) => Promise<string | void> | string | void

    'record/change': (rdoc: Rdoc, $set?: any, $push?: any) => void
}

function getHooks<K extends keyof EventMap>(name: K) {
    const hooks = _hooks[name] || (_hooks[name] = []);
    if (hooks.length >= 128) {
        console.warn(
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
    const dispose = () => removeListener(name, listener);
    _disposables.push(name === 'dispose' ? listener as Disposable : dispose);
    return dispose;
}

export function prependListener<K extends keyof EventMap>(name: K, listener: EventMap[K]) {
    getHooks(name).unshift(listener);
    const dispose = () => removeListener(name, listener);
    _disposables.push(name === 'dispose' ? listener as Disposable : dispose);
    return dispose;
}

export function once<K extends keyof EventMap>(name: K, listener: EventMap[K]) {
    // @ts-ignore
    const dispose = addListener(name, (...args: Parameters<EventMap[K]>) => {
        dispose();
        // @ts-ignore
        return listener.apply(this, args);
    });
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
    for (const callback of _hooks[name] || []) {
        tasks.push(callback.apply(this, args));
    }
    await Promise.all(tasks);
}

export function emit<K extends keyof EventMap>(name: K, ...args: Parameters<EventMap[K]>) {
    return parallel(name, ...args);
}

export async function serial<K extends keyof EventMap>(name: K, ...args: Parameters<EventMap[K]>): Promise<ReturnType<EventMap[K]>> {
    for (const callback of _hooks[name] || []) {
        const result = await callback.apply(this, args);
        if (isBailed(result)) return result;
    }
    return null;
}

export function bail<K extends keyof EventMap>(name: K, ...args: Parameters<EventMap[K]>): ReturnType<EventMap[K]> {
    for (const callback of _hooks[name] || []) {
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

global.Hydro.service.bus = {
    addListener, bail, boardcast, emit, on, off, once, parallel, prependListener, removeListener, serial,
};
