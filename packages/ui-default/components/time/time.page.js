import $ from 'jquery';
import * as timeago from 'timeago.js';
import en_US from 'timeago.js/lib/lang/en_US';
import ko from 'timeago.js/lib/lang/ko';
import zh_CN from 'timeago.js/lib/lang/zh_CN';
import zh_TW from 'timeago.js/lib/lang/zh_TW';
import { AutoloadPage } from 'vj/misc/Page';
import { i18n } from 'vj/utils';

try {
  const locales = {
    // eslint-disable-next-line @typescript-eslint/naming-convention
    zh_CN, zh_TW, ko, en_US,
  };
  const locale = locales[i18n('timeago_locale')] || locales.en_US;
  timeago.register(i18n('timeago_locale'), locale);
} catch (e) {
  console.error(`Cannot register timeago locale: ${i18n('timeago_locale')}`, e);
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
