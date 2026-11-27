import $ from 'jquery';
import * as timeago from 'timeago.js';
import en_US from 'timeago.js/lib/lang/en_US';
import ko from 'timeago.js/lib/lang/ko';
import zh_CN from 'timeago.js/lib/lang/zh_CN';
import zh_TW from 'timeago.js/lib/lang/zh_TW';
import { AutoloadPage } from 'vj/misc/Page';
import { i18n } from 'vj/utils';

timeago.register('en_US', en_US);
timeago.register('ko', ko);
timeago.register('zh_CN', zh_CN);
timeago.register('zh_TW', zh_TW);
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
