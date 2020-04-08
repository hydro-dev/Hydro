import { AutoloadPage } from 'vj/misc/PageLoader';

import tpl from 'vj/utils/tpl';

const menuHeadingPage = new AutoloadPage('menuHeadingPage', null, () => {
  $('[data-heading-extract-to]').get().forEach((container) => {
    const $container = $(container);
    const $target = $('body').find($container.attr('data-heading-extract-to'));
    if ($target.length === 0) {
      return;
    }
    let $menu = $target.children('.menu');
    if ($menu.length === 0) {
      $menu = $(tpl`<ul class="menu collapsed"></ul>`).appendTo($target);
      $target.children('.menu__link').addClass('expandable');
    }
    $container.find('[data-heading]').get().forEach((heading) => {
      const $heading = $(heading);
      $(tpl`
        <li class="menu__item">
          <a class="menu__link" href="#${$heading.attr('id') || ''}">
            ${$heading.text()}
          </a>
        </li>
      `).appendTo($menu);
    });
  });
});

export default menuHeadingPage;
