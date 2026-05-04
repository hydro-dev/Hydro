import { useMemo, useSyncExternalStore } from 'react';
import { store } from './store';
import type { InterceptorEntry, SlotName } from './types';

function buildChain<P extends Record<string, any>>(
  interceptors: InterceptorEntry<P>[],
  DefaultComp: React.FC<P>,
): (props: P) => React.ReactNode {
  let pipeline: (props: P) => React.ReactNode = (props) => <DefaultComp {...props} />;

  for (let i = interceptors.length - 1; i >= 0; i--) {
    const { interceptor } = interceptors[i];
    const downstream = pipeline;

    pipeline = (props: P) =>
      interceptor(props, (overrideProps) =>
        downstream(overrideProps ? { ...props, ...overrideProps } : props),
      );
  }

  return pipeline;
}

export function defineSlot<P extends Record<string, any>>(
  name: SlotName,
  DefaultComp: React.FC<P>,
): React.FC<P> {
  store.setDefault(name, DefaultComp);

  const subscribeSlot = (cb: () => void) => store.subscribe(name, cb);
  const getSnapshot = () => store.getVersion(name);

  const SlotComponent: React.FC<P> = (props) => {
    const version = useSyncExternalStore(subscribeSlot, getSnapshot);

    // eslint-disable-next-line react-hooks/exhaustive-deps
    const chain = useMemo(() => buildChain(store.getInterceptors(name), store.getDefault(name)!), [version]);

    return <>{chain(props)}</>;
  };

  SlotComponent.displayName = `Slot(${name})`;
  return SlotComponent;
}
