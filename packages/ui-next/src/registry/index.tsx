/* eslint-disable react-refresh/only-export-components */

import React from 'react';

type Scope = 'page' | 'component';
export type ComponentName = `${Scope}:${string}`;

interface BeforeAfterEntry {
  id: string;
  Comp: React.FC<any>;
}

interface PatchEntry {
  id: string;
  cb: (props: any) => any;
}

function createRegistry() {
  return {
    components: {} as Record<string, React.FC<any>>,
    before: {} as Record<string, BeforeAfterEntry[]>,
    after: {} as Record<string, BeforeAfterEntry[]>,
    patch: {} as Record<string, PatchEntry[]>,
  };
}

const registry: ReturnType<typeof createRegistry> = import.meta.hot?.data?.registry ?? createRegistry();
if (import.meta.hot) import.meta.hot.data.registry = registry;

let idCounter = import.meta.hot?.data?.idCounter ?? 0;
if (import.meta.hot) {
  Object.defineProperty(import.meta.hot.data, 'idCounter', {
    get: () => idCounter,
    set: (v: number) => { idCounter = v; },
  });
}
function genId() { return `__auto_${++idCounter}`; }

function upsert<T extends { id: string }>(list: T[], entry: T) {
  const idx = list.findIndex((e) => e.id === entry.id);
  if (idx !== -1) list[idx] = entry;
  else list.push(entry);
}

export function Component<P extends Record<string, any>>(
  name: ComponentName,
  Inner: React.FC<P>,
): React.FC<P> {
  if (registry.components[name]) {
    console.warn(`[Registry] Component "${name}" is being re-registered.`);
  }
  const Wrapped: React.FC<P> = (props) => {
    let patched = props;
    for (const { cb } of registry.patch[name] ?? []) {
      try {
        patched = cb(patched);
      } catch (e) {
        console.error(`[Registry] patch error in "${name}":`, e);
      }
    }
    return (
      <>
        {(registry.before[name] ?? []).map(({ id, Comp }) => <Comp key={id} {...patched} />)}
        <Inner {...patched} />
        {(registry.after[name] ?? []).map(({ id, Comp }) => <Comp key={id} {...patched} />)}
      </>
    );
  };
  Wrapped.displayName = `Registry(${name})`;
  registry.components[name] = Wrapped;
  return Wrapped;
}

export function before(name: ComponentName, Comp: React.FC<any>, id?: string) {
  const list = registry.before[name] ??= [];
  upsert(list, { id: id ?? genId(), Comp });
}

export function after(name: ComponentName, Comp: React.FC<any>, id?: string) {
  const list = registry.after[name] ??= [];
  upsert(list, { id: id ?? genId(), Comp });
}

export function patch(name: ComponentName, cb: (props: any) => any, id?: string) {
  const list = registry.patch[name] ??= [];
  upsert(list, { id: id ?? genId(), cb });
}

export interface RegistryContext {
  before: typeof before;
  after: typeof after;
  patch: typeof patch;
  register: typeof Component;
}

export function createRegistryContext(): RegistryContext {
  return {
    before, after, patch, register: Component,
  };
}
