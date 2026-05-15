import { after, before, intercept, patch, replace, wrap } from './interceptors';
import { registerPage } from './page';

export interface PluginAPI {
  intercept: typeof intercept;
  before: typeof before;
  after: typeof after;
  patch: typeof patch;
  replace: typeof replace;
  wrap: typeof wrap;
  registerPage: typeof registerPage;
}

export function createPluginAPI(): PluginAPI {
  return { intercept, before, after, patch, replace, wrap, registerPage };
}

export interface PluginDefinition {
  name: string;
  setup: (api: PluginAPI) => (() => void) | void;
}

export function installPlugin(plugin: PluginDefinition): () => void {
  const api = createPluginAPI();
  const cleanup = plugin.setup(api);
  return () => cleanup?.();
}
