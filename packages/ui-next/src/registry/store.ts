import type { InterceptorEntry, InterceptorOptions, SlotName } from './types';

type Listener = () => void;

interface RegistryState {
  interceptors: Record<string, InterceptorEntry[]>;
  defaults: Record<string, React.FC<any>>;
}

function createRegistryStore() {
  const state: RegistryState = {
    interceptors: {},
    defaults: {},
  };

  const slotListeners: Record<string, Set<Listener>> = {};
  const versions: Record<string, number> = {};

  let idCounter = 0;
  const genId = () => `__slot_${++idCounter}`;

  function subscribe(name: SlotName, cb: Listener) {
    const set = (slotListeners[name] ??= new Set());
    set.add(cb);
    return () => set.delete(cb);
  }

  function notify(name: SlotName) {
    slotListeners[name]?.forEach((l) => l());
  }

  function getVersion(name: SlotName): number {
    return versions[name] ?? 0;
  }

  function bumpVersion(name: SlotName) {
    versions[name] = (versions[name] ?? 0) + 1;
    notify(name);
  }

  function addInterceptor<P>(
    name: SlotName,
    interceptor: (props: P, next: (overrideProps?: Partial<P>) => React.ReactNode) => React.ReactNode,
    opts?: InterceptorOptions,
  ): () => void {
    const entry: InterceptorEntry<P> = {
      id: opts?.id ?? genId(),
      priority: opts?.priority ?? 0,
      interceptor,
    };

    const list = (state.interceptors[name] ??= []);
    const idx = list.findIndex((e) => e.id === entry.id);
    if (idx !== -1) list[idx] = entry;
    else list.push(entry);

    list.sort((a, b) => a.priority - b.priority);
    bumpVersion(name);

    return () => {
      const arr = state.interceptors[name];
      if (!arr) return;
      const i = arr.findIndex((e) => e.id === entry.id);
      if (i !== -1) {
        arr.splice(i, 1);
        bumpVersion(name);
      }
    };
  }

  function getInterceptors(name: SlotName): InterceptorEntry[] {
    return state.interceptors[name] ?? [];
  }

  function setDefault(name: SlotName, comp: React.FC<any>) {
    state.defaults[name] = comp;
  }

  function getDefault(name: SlotName): React.FC<any> | undefined {
    return state.defaults[name];
  }

  return {
    subscribe,
    getVersion,
    addInterceptor,
    getInterceptors,
    setDefault,
    getDefault,
  };
}

export const store: ReturnType<typeof createRegistryStore> = import.meta.hot?.data?.slotStore ?? createRegistryStore();
if (import.meta.hot) import.meta.hot.data.slotStore = store;
