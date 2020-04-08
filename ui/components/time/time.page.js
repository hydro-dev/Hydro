import timeagoFactory from 'timeago.js';

import { AutoloadPage } from 'vj/misc/PageLoader';

import i18n from 'vj/utils/i18n';

const timeago = timeagoFactory();
timeago.setLocale(i18n('timeago_locale'));

function runRelativeTime($container) {
  $container.find('span.time.relative[data-timestamp]').get().forEach((element) => {
    const $element = $(element);
    if ($element.attr('data-has-timeago') !== undefined) {
      return;
    }
    $element.attr('data-tooltip', $element.text());
    $element.attr('datetime', ($element.attr('data-timestamp') || 0) * 1000);
    $element.attr('data-has-timeago', '1');
    timeago.render(element);
  });
}

function cancelRelativeTime($container) {
  $container.find('span.time.relative[data-timestamp]').get().forEach((element) => {
    const $element = $(element);
    if ($element.attr('data-has-timeago') === undefined) {
      return;
    }
    $element.removeAttr('data-has-timeago');
    timeagoFactory.cancel(element);
  });
}

const relativeTimePage = new AutoloadPage('relativeTimePage', () => {
  runRelativeTime($('body'));
  $(document).on('vjContentNew', e => runRelativeTime($(e.target)));
  $(document).on('vjContentRemove', e => cancelRelativeTime($(e.target)));
});

export default relativeTimePage;
