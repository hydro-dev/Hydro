import $ from 'jquery';
import _ from 'lodash';
import responsiveCutoff from 'vj/breakpoints.json';
import { AutoloadPage } from 'vj/misc/Page';
import { isAbove, isBelow } from 'vj/utils/mediaQuery';

function getCutoff(str) {
  if (str === 'medium') return responsiveCutoff.mobile;
  if (str === 'large') return responsiveCutoff.desktop;
  return 0;
}

function updateStickies($stickies) {
  const navHeight = isBelow(responsiveCutoff.mobile) ? 0 : ($('.nav').height() || 0);
  $stickies.get().forEach((element) => {
    const $sticky = $(element);
    const shouldEnableSticky = isAbove($sticky.data('sticky-cutoff-min'));
    const topOffset = 10 + navHeight;
    if (shouldEnableSticky) {
      element.style.position = 'sticky';
      element.style.top = `${topOffset}px`;
      element.style.maxHeight = `calc(100vh - ${topOffset + 10}px)`;
      element.style.overflowY = 'auto';
    } else {
      element.style.position = '';
      element.style.top = '';
      element.style.maxHeight = '';
      element.style.overflowY = '';
    }
  });
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
  });
  updateStickies($stickies);
  if (shouldListenResize) {
    $(window).on('resize', _.throttle(() => updateStickies($stickies), 300));
  }
});

export default stickyPage;
