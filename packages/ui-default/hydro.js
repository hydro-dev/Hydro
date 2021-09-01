import './modules';
import 'jquery.transit';
import _ from 'lodash';
import Notification from 'vj/components/notification';
import PageLoader from 'vj/misc/PageLoader';
import delay from 'vj/utils/delay';

const start = new Date();
window.UserContext = JSON.parse(window.UserContext);

function buildSequence(pages, type) {
  if (process.env.NODE_ENV !== 'production') {
    if (['before', 'after'].indexOf(type) === -1) {
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

async function load() {
  for (const page of window.Hydro.preload) await eval(page); // eslint-disable-line no-eval

  const pageLoader = new PageLoader();

  const currentPageName = document.documentElement.getAttribute('data-page');
  const currentPage = pageLoader.getNamedPage(currentPageName);
  const includedPages = pageLoader.getAutoloadPages();
  const loadSequence = [
    ...buildSequence(includedPages, 'before'),
    ...buildSequence(currentPage, 'before'),
    ...buildSequence(includedPages, 'after'),
    ...buildSequence(currentPage, 'after'),
  ];
  // eslint-disable-next-line no-restricted-syntax
  for (const { page, func, type } of loadSequence) {
    const ts = new Date().getTime();
    try {
      await func(currentPageName);
    } catch (e) {
      Notification.warn(`Failed to call '${type}Loading' of ${page.name}`);
      console.error(`Failed to call '${type}Loading' of ${page.name}\n${e.stack}`);
    }
    if (process.env.NODE_ENV !== 'production') {
      console.time(`${page.name}: ${type}Loading`);
    }
    const time = new Date().getTime() - ts;
    if ((process.env.NODE_ENV !== 'production' && time > 16) || time > 256) {
      console.log(`${page.name}: ${type}Loading took ${time}ms`);
    }
  }
  const sections = _.map($('.section').get(), (section, idx) => ({
    shouldDelay: idx < 5, // only animate first 5 sections
    $element: $(section),
  }));
  console.log('done! %d ms', new Date().getTime() - start.getTime());
  // eslint-disable-next-line no-restricted-syntax
  for (const { $element, shouldDelay } of sections) {
    $element.addClass('visible');
    if (shouldDelay) await delay(50);
  }
  await delay(500);
  // eslint-disable-next-line no-restricted-syntax
  for (const { $element } of sections) $element.trigger('vjLayout');
  $(document).trigger('vjPageFullyInitialized');
}

load();
