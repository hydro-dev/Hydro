import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import plugins from 'virtual:hydro-plugins';
import App from './App';
import { createContext } from './context';
import { type PageData, PageDataProvider } from './pageData';

const ctx = createContext();
for (const plugin of plugins) {
  plugin.apply(ctx);
}

const injectionEl = document.getElementById('__HYDRO_INJECTION__');
const initialData: PageData = injectionEl
  ? JSON.parse(injectionEl.textContent!)
  : { name: 'invalid_init', args: {}, url: window.location.pathname };

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <PageDataProvider initial={initialData}>
      <App />
    </PageDataProvider>
  </StrictMode>,
);
