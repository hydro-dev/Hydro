import { lazy } from 'react';
import { store } from './store';
import type { PageEntry, PageLoader, PageSlotName, RegisterPageOptions } from './types';

export function resolvePage(name: string, template: string, isError = false): readonly [PageSlotName, PageEntry | undefined] {
  if (isError) {
    return ['page:error', store.getDefault('page:error')];
  }

  const templateName = template.replace(/\.html$/, '');
  if (templateName) {
    const templateSlot = `page:${templateName}` as PageSlotName;
    const templateEntry = store.getDefault(templateSlot);
    if (templateEntry) return [templateSlot, templateEntry];
  }

  const routeSlot = `page:${name}` as PageSlotName;
  return [routeSlot, store.getDefault(routeSlot)];
}

export function registerPage<P = any>(
  name: string,
  loader: PageLoader<P>,
  options: RegisterPageOptions = {},
) {
  const Page = lazy(loader);
  const entry: PageEntry<P> = { Page, layout: options.layout ?? 'default' };
  store.setDefault(`page:${name}` as PageSlotName, entry);
}
