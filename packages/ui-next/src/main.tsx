import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import plugins from 'virtual:hydro-plugins';
import App from './app';
import { type PageData, PageDataProvider } from './context/page-data';
import { createRegistryContext } from './registry';

const ctx = createRegistryContext();
for (const plugin of plugins) {
  plugin.apply(ctx);
}

const injectionEl = document.getElementById('__HYDRO_INJECTION__');
let initialData: PageData = {
  name: '',
  args: {},
  url: window.location.pathname,
  routeMap: {},
};
if (injectionEl) {
  try {
    initialData = JSON.parse(injectionEl.textContent!);
  } catch (e) {
    console.error('[Hydro] Failed to parse injection data:', e);
  }
}

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <PageDataProvider initial={initialData}>
      <App />
    </PageDataProvider>
  </StrictMode>,
);
