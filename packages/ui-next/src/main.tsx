import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import plugins from 'virtual:hydro-plugins';
import App from './app';
import { PageDataProvider } from './context/page-data';
import { RouterProvider } from './context/router';
import { initialPage } from './globals';
import { installPlugin } from './registry';

for (const plugin of plugins) {
  installPlugin(plugin);
}

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <PageDataProvider initial={initialPage}>
      <RouterProvider>
        <App />
      </RouterProvider>
    </PageDataProvider>
  </StrictMode>,
);
