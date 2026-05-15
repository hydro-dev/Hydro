import 'sticky-kit/dist/sticky-kit';

import $ from 'jquery';
import _ from 'lodash';
import responsiveCutoff from 'vj/breakpoints.json';
import { AutoloadPage } from 'vj/misc/Page';
import { isAbove, isBelow } from 'vj/utils/mediaQuery';

const navHeight = isBelow(responsiveCutoff.mobile)
  ? 0
  : $('.nav').height();

function updateStickies($stickies) {
  $stickies.get().forEach((element) => {
    const $sticky = $(element);
    const shouldEnableSticky = (isAbove($sticky.data('sticky-cutoff-min')));
    const stickyEnabled = $sticky.data('sticky-enabled');
    if (shouldEnableSticky && !stickyEnabled) {
      const stickyOptions = {};
      const $stickyParent = $sticky.closest('[data-sticky-parent]');
      if ($stickyParent.length > 0) {
        stickyOptions.parent = $stickyParent;
      }
      stickyOptions.offset_top = 10 + navHeight;
      $sticky.stick_in_parent(stickyOptions);
      $sticky.data('sticky-enabled', true);
    } else if (!shouldEnableSticky && stickyEnabled) {
      $sticky.trigger('sticky_kit:detach');
      $sticky.data('sticky-enabled', false);
    }
  });
}

function getCutoff(str) {
  if (str === 'medium') {
    return responsiveCutoff.mobile;
  } if (str === 'large') {
    return responsiveCutoff.desktop;
  }
  return 0;
}

function stickyRelayout() {
  $('body').trigger('sticky_kit:recalc');
}

const stickyPage = new AutoloadPage('stickyPage', () => {
  let shouldListenResize = false;
  const $stickies = $('[data-sticky]');
  $stickies.get().forEach((element) => {
    const $sticky = $(element);
    const minEnabledSize = $sticky.attr('data-sticky');
    if (minEnabledSize === 'medium' || minEnabledSize === 'large') {
      shouldListenResize = true;
    }
    $sticky.data('sticky-cutoff-min', getCutoff(minEnabledSize));
    $sticky.data('sticky-enabled', false);
  });
  updateStickies($stickies);
  if (shouldListenResize) {
    $(window).on('resize', _.throttle(() => updateStickies($stickies), 300));
  }
  $(document).on('vjLayout', _.throttle(stickyRelayout, 100));
});

export default stickyPage;
