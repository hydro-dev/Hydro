import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import plugins from 'virtual:hydro-plugins';
import App from './app';
import { type PageData, PageDataProvider } from './context/page-data';
import { RouterProvider } from './context/router';
import { installPlugin } from './registry';

for (const plugin of plugins) {
  installPlugin(plugin);
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
    console.log('[Hydro] initial data:', initialData);
  } catch (e) {
    console.error('[Hydro] Failed to parse injection data:', e);
  }
}

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <PageDataProvider initial={initialData}>
      <RouterProvider>
        <App />
      </RouterProvider>
    </PageDataProvider>
  </StrictMode>,
);
