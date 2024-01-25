import $ from 'jquery';
import responsiveCutoff from 'vj/breakpoints.json';
import { AutoloadPage } from 'vj/misc/Page';
import { isBelow } from 'vj/utils/mediaQuery';
import { slideDown, slideUp } from 'vj/utils/slide';

const footerPage = new AutoloadPage('footerPage', () => {
  if (!$('.footer').length) return;
  $('.footer__category.expandable > h1').on('click', async (ev) => {
    if (!isBelow(responsiveCutoff.mobile)) return;
    const $category = $(ev.currentTarget).closest('.footer__category');
    const $list = $category.find('.footer__category__expander');
    if ($category.hasClass('animating')) return;
    $category.addClass('animating');
    if ($category.hasClass('expanded')) {
      $category.removeClass('expanded');
      await slideUp($list, 300, { opacity: 1 }, { opacity: 0 });
    } else {
      $category.addClass('expanded');
      await slideDown($list, 300, { opacity: 0 }, { opacity: 1 });
    }
    $category.removeClass('animating');
  });
});

export default footerPage;
