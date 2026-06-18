export { SlotErrorBoundary } from './error-boundary';
export { after, before, intercept, patch, replace, wrap } from './interceptors';
export { registerLayout } from './layout';
export type { LayoutComponent } from './layout';
export { registerPage } from './page';
export { installPlugin } from './plugin';
export type { PluginAPI, PluginDefinition } from './plugin';
export { defineSlot } from './slot';
export type {
  AppSlotName, ComponentSlotName, Interceptor, InterceptorEntry, InterceptorOptions,
  LayoutSlotName, PageEntry, PageSlotName, RegisterPageOptions, SlotName, SlotValue,
} from './types';
