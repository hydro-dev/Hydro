import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import plugins from 'virtual:hydro-plugins';
import App from './App';
import { createContext } from './context';

const ctx = createContext();
for (const plugin of plugins) {
  plugin.apply(ctx);
}

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App />
  </StrictMode>,
);
