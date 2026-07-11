import { lazy } from 'react';
import { store } from './store';
import type { PageEntry, PageLoader, PageSlotName, RegisterPageOptions } from './types';

export function registerPage<P = any>(
  name: string,
  loader: PageLoader<P>,
  options: RegisterPageOptions = {},
) {
  const Page = lazy(loader);
  const entry: PageEntry<P> = { Page, layout: options.layout ?? 'default' };
  store.setDefault(`page:${name}` as PageSlotName, entry);
}
