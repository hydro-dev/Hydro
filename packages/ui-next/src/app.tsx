import { Suspense, useMemo, useSyncExternalStore } from 'react';
import DefaultLayout from './components/layout';
import { usePageData } from './context/page-data';
import { defineSlot } from './registry';
import { SlotErrorBoundary } from './registry/error-boundary';
import { resolvePage } from './registry/page';
import { store } from './registry/store';

const App = defineSlot('app:root', () => {
  const { name, template, args } = usePageData();

  const isError = !!(args as Record<string, unknown>).error;

  const [slotName, entry] = useMemo(() => {
    const resolved = resolvePage(name, template, isError);
    if (import.meta.env.DEV) {
      console.log(`[ui-next] using page slot "${resolved[0]}"`);
    }
    return resolved;
  }, [name, template, isError]);

  const [subscribe, getSnapshot] = useMemo(() => [
    (cb: () => void) => store.subscribe(slotName, cb),
    () => store.getVersion(slotName),
  ], [slotName]);

  useSyncExternalStore(subscribe, getSnapshot);

  if (!entry) {
    return (
      <div>
        Page not found: <code>{name}</code>
      </div>
    );
  }

  const Layout = store.getDefault(`layout:${entry.layout}`) ?? DefaultLayout;
  const { Page } = entry;

  return (
    <SlotErrorBoundary slotName={slotName} label="renderer">
      <Suspense fallback={null}>
        <Layout>
          <Suspense fallback={<div>Loading...</div>}>
            <Page />
          </Suspense>
        </Layout>
      </Suspense>
    </SlotErrorBoundary>
  );
});

export default App;
