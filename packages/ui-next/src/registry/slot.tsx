import { useMemo, useSyncExternalStore } from 'react';
import { SlotErrorBoundary } from './error-boundary';
import { store } from './store';
import type { InterceptorEntry, SlotName } from './types';

function buildChain<P extends Record<string, any>>(
  interceptors: InterceptorEntry<P>[],
  DefaultComp: React.FC<P>,
  slotName: SlotName,
): (props: P) => React.ReactNode {
  let pipeline: (props: P) => React.ReactNode = (props) => (
    <SlotErrorBoundary slotName={slotName} label="default">
      <DefaultComp {...props} />
    </SlotErrorBoundary>
  );

  for (let i = interceptors.length - 1; i >= 0; i--) {
    const { interceptor, id } = interceptors[i];
    const downstream = pipeline;

    pipeline = (props: P) => (
      <SlotErrorBoundary slotName={slotName} label={`interceptor:${id}`}>
        {interceptor(props, (overrideProps) =>
          downstream(overrideProps ? { ...props, ...overrideProps } : props),
        )}
      </SlotErrorBoundary>
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
    const chain = useMemo(() => buildChain(store.getInterceptors(name), store.getDefault(name)!, name), [version]);

    return (
      <SlotErrorBoundary slotName={name} label="slot">
        {chain(props)}
      </SlotErrorBoundary>
    );
  };

  SlotComponent.displayName = `Slot(${name})`;
  return SlotComponent;
}
