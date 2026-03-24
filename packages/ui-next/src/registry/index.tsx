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

const registry = {
  components: {} as Record<string, React.FC<any>>,
  before: {} as Record<string, BeforeAfterEntry[]>,
  after: {} as Record<string, BeforeAfterEntry[]>,
  patch: {} as Record<string, PatchEntry[]>,
};

let idCounter = 0;
function genId() { return `__auto_${++idCounter}`; }

export function Component<P extends Record<string, any>>(
  name: ComponentName,
  Inner: React.FC<P>,
): React.FC<P> {
  const Wrapped: React.FC<P> = (props) => {
    let patched = props;
    for (const { cb } of registry.patch[name] ?? []) {
      patched = cb(patched);
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
  const entryId = id ?? genId();
  const list = registry.before[name] ??= [];
  const idx = list.findIndex((e) => e.id === entryId);
  if (idx !== -1) list[idx] = { id: entryId, Comp };
  else list.push({ id: entryId, Comp });
}

export function after(name: ComponentName, Comp: React.FC<any>, id?: string) {
  const entryId = id ?? genId();
  const list = registry.after[name] ??= [];
  const idx = list.findIndex((e) => e.id === entryId);
  if (idx !== -1) list[idx] = { id: entryId, Comp };
  else list.push({ id: entryId, Comp });
}

export function patch(name: ComponentName, cb: (props: any) => any, id?: string) {
  const entryId = id ?? genId();
  const list = registry.patch[name] ??= [];
  const idx = list.findIndex((e) => e.id === entryId);
  if (idx !== -1) list[idx] = { id: entryId, cb };
  else list.push({ id: entryId, cb });
}
