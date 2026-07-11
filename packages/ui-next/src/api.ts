// Components
export { Link, type LinkProps } from './components/link';

// Context
export { type PageData, usePageData } from './context/page-data';
export { type RouterState, useNavigate, useRouterState } from './context/router';
export { useBuildUrl } from './hooks/use-build-url';

// Registry
export type {
  Interceptor, InterceptorEntry, InterceptorOptions,
  PluginAPI, PluginDefinition,
  SlotName,
} from './registry';
export { defineSlot } from './registry';

// Shared dependencies
export { default as React } from 'react';
export { default as ReactDOM } from 'react-dom/client';
export { default as jsxRuntime } from 'react/jsx-runtime';
