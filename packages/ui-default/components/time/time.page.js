import $ from 'jquery';
import * as timeago from 'timeago.js';
import { AutoloadPage } from 'vj/misc/Page';
import { i18n } from 'vj/utils';

try {
  const locales = require.context('timeago.js/lib/lang', false, /\.js$/);
  let locale;
  try {
    locale = locales(`./${i18n('timeago_locale')}.js`).default;
  } catch (e) {
    locale = locales('./en_US.js').default;
  }
  timeago.register(i18n('timeago_locale'), locale);
} catch (e) {
  console.error(`Cannot register timeago locale: ${i18n('timeago_locale')}`);
}
function runRelativeTime($container) {
  $container.find('span.time.relative[data-timestamp]').get().forEach((element) => {
    const $element = $(element);
    if ($element.attr('data-has-timeago') !== undefined) return;
    $element.attr('data-tooltip', $element.text());
    $element.attr('datetime', ($element.attr('data-timestamp') || 0) * 1000);
    $element.attr('data-has-timeago', '1');
    timeago.render(element, i18n('timeago_locale'));
  });
}

function cancelRelativeTime($container) {
  $container.find('span.time.relative[data-timestamp]').get().forEach((element) => {
    const $element = $(element);
    if ($element.attr('data-has-timeago') === undefined) {
      return;
    }
    $element.removeAttr('data-has-timeago');
    timeago.cancel(element);
  });
}

const relativeTimePage = new AutoloadPage('relativeTimePage', () => {
  if (!UserContext.showTimeAgo) return;
  runRelativeTime($('body'));
  $(document).on('vjContentNew', (e) => runRelativeTime($(e.target)));
  $(document).on('vjContentRemove', (e) => cancelRelativeTime($(e.target)));
});

export default relativeTimePage;
