import 'jquery.transit';

import $ from 'jquery';
import _ from 'lodash';
import Notification from 'vj/components/notification';
import PageLoader from 'vj/misc/PageLoader';
import { delay } from 'vj/utils';

declare global {
  interface Window {
    UserContext: any;
    UiContext: any;
    Hydro: any;
    /** @deprecated */
    externalModules: Record<string, string>;
    captureException?: (e: Error) => void;
  }
}

const start = new Date();

function buildSequence(pages, type) {
  if (process.env.NODE_ENV !== 'production') {
    if (!['before', 'after'].includes(type)) {
      throw new Error("'type' should be one of 'before' or 'after'");
    }
  }
  return pages
    .filter((p) => p && p[`${type}Loading`])
    .map((p) => ({
      page: p,
      func: p[`${type}Loading`],
      type,
    }));
}

function rounded() {
  if (!UserContext.rounded) return;
  const style = document.createElement('style');
  style.innerHTML = `
    .section { border-radius: 8px; }
    .section__table-header { border-radius: 8px 8px 0 0; }
  `;
  document.head.append(style);
}

async function animate() {
  if (UserContext.skipAnimate) return;
  const style = document.createElement('style');
  style.innerHTML = `.section {
    transition: transform .5s, opacity .5s;
    transition-timing-function: ease-out-cubic;
  }`;
  document.head.append(style);
  const sections = _.map($('.section').get(), (section, idx) => ({
    shouldDelay: idx < 5, // only animate first 5 sections
    $element: $(section),
  }));
  for (const { $element, shouldDelay } of sections) {
    $element.addClass('visible');
    if (shouldDelay) await delay(50);
  }
}

export async function initPageLoader() {
  const pageLoader = new PageLoader();
  rounded();

  const currentPageName = document.documentElement.getAttribute('data-page');
  const currentPage = pageLoader.getNamedPage(currentPageName);
  const includedPages = pageLoader.getAutoloadPages();
  const loadSequence = [
    ...buildSequence(includedPages, 'before'),
    ...buildSequence(currentPage, 'before'),
    ...buildSequence(includedPages, 'after'),
    ...buildSequence(currentPage, 'after'),
  ];
  const loadPage = (depth: number, type: 'before' | 'after') => async (name: string) => {
    if (depth > 32) {
      console.error('loadPage depth', depth);
      return;
    }
    for (const { func } of buildSequence(pageLoader.getPage(name), type)) {
      await func(name, loadPage(depth + 1, type));
    }
  };
  for (const { page, func, type } of loadSequence) {
    const ts = Date.now();
    try {
      await func(currentPageName, loadPage(1, type));
    } catch (e) {
      (window as any).captureException?.(e);
      Notification.warn(`Failed to call '${type}Loading' of ${page.name}`);
      console.error(`Failed to call '${type}Loading' of ${page.name}\n${e.stack}`);
      console.error(e);
    }
    if (process.env.NODE_ENV !== 'production') {
      console.time(`${page.name}: ${type}Loading`);
    }
    const time = Date.now() - ts;
    if ((process.env.NODE_ENV !== 'production' && time > 16) || time > 256) {
      console.log(`${page.name}: ${type}Loading took ${time}ms`);
    }
  }
  console.log('done! %d ms', Date.now() - start.getTime());
  $('.page-loader').hide();
  await animate();
  $('.section').addClass('visible');
  await delay(500);
  $('.section').trigger('vjLayout');
  $(document).trigger('vjPageFullyInitialized');
}
