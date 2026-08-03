import 'jquery.easing';

import $ from 'jquery';
import { AutoloadPage } from 'vj/misc/Page';

const smoothScrollPage = new AutoloadPage('smoothScrollPage', null, () => {
  const HISTORY_SUPPORT = !!(typeof window.history === 'object' && window.history.pushState);
  const ANCHOR_REGEX = /^#[^ ]+$/;
  const OFFSET_HEIGHT = 10 + ($('.nav').height() || 0);

  function scrollIfAnchor(href, pushToHistory) {
    if (!ANCHOR_REGEX.test(href)) return false;
    const match = document.getElementById(href.slice(1));
    if (!match) return false;
    const $content = $(match).closest('.collapsible-content');
    if ($content.length && !$content.hasClass('expanded')) {
      const $inner = $content.find('.collapsible-content__inner');
      $inner.scrollTop(0);
      $content.find('.collapsible-toggle__link').trigger('click');
      $content.addClass('expanded');
      $inner.css('max-height', 'none');
    }
    requestAnimationFrame(() => {
      const rect = match.getBoundingClientRect();
      const anchorOffset = window.pageYOffset + rect.top - OFFSET_HEIGHT;
      $('html,body').animate({ scrollTop: anchorOffset }, 200, 'easeOutCubic');
    });
    if (HISTORY_SUPPORT && pushToHistory) {
      window.history.pushState({}, document.title, window.location.pathname + href);
    }
    return true;
  }

  function scrollToCurrent() {
    scrollIfAnchor(window.location.hash);
  }

  function delegateAnchors(e) {
    if (e.metaKey || e.ctrlKey || e.shiftKey || e.altKey) return;
    const elem = e.target.closest('a');
    if (
      elem
      && scrollIfAnchor(elem.getAttribute('href'), true)
    ) e.preventDefault();
  }

  $(document).on('vjPageFullyInitialized', () => {
    scrollToCurrent();
    window.addEventListener('hashchange', scrollToCurrent);
    document.body.addEventListener('click', delegateAnchors);
  });
});

export default smoothScrollPage;
