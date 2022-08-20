/* eslint-disable no-await-in-loop */

const _hooks: Record<keyof any, Array<(...args: any[]) => any>> = {};

function isBailed(value: any) {
  return value !== null && value !== false && value !== undefined;
}

export type Disposable = () => void;
export type VoidReturn = Promise<any> | any;

export interface EventMap extends Record<string, any> {
  'scratchpadEditorCreate': (editor, monaco) => any;
}

function getHooks<K extends keyof EventMap>(name: K) {
  const hooks = _hooks[name] || (_hooks[name] = []);
  if (hooks.length >= 2048) {
    console.warn(
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
  for (const callback of _hooks[name] || []) {
    tasks.push(callback.apply(this, args));
  }
  await Promise.all(tasks);
}

export function emit<K extends keyof EventMap>(name: K, ...args: Parameters<EventMap[K]>) {
  return parallel(name, ...args);
}

export async function serial<K extends keyof EventMap>(name: K, ...args: Parameters<EventMap[K]>): Promise<void> {
  const hooks = Array.from(_hooks[name] || []);
  for (const callback of hooks) {
    await callback.apply(this, args);
  }
}

export async function bail<K extends keyof EventMap>(name: K, ...args: Parameters<EventMap[K]>): Promise<ReturnType<EventMap[K]>> {
  const hooks = Array.from(_hooks[name] || []);
  for (const callback of hooks) {
    let result = callback.apply(this, args);
    if (result instanceof Promise) result = await result;
    if (isBailed(result)) return result;
  }
  return null;
}
