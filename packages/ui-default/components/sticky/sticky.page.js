import $ from 'jquery';
import _ from 'lodash';
import responsiveCutoff from 'vj/breakpoints.json';
import { AutoloadPage } from 'vj/misc/Page';
import { isAbove, isBelow } from 'vj/utils/mediaQuery';

const navHeight = isBelow(responsiveCutoff.mobile)
  ? 0
  : $('.nav').height();

function getCutoff(str) {
  if (str === 'medium') return responsiveCutoff.mobile;
  if (str === 'large') return responsiveCutoff.desktop;
  return 0;
}

function updateStickies($stickies) {
  $stickies.get().forEach((element) => {
    const $sticky = $(element);
    const shouldEnableSticky = isAbove($sticky.data('sticky-cutoff-min'));
    if (shouldEnableSticky) {
      element.style.position = 'sticky';
      element.style.top = `${10 + navHeight}px`;
    } else {
      element.style.position = '';
      element.style.top = '';
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
