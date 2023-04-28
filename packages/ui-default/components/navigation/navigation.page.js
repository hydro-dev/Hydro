import $ from 'jquery';
import Slideout from 'slideout';
import Notification from 'vj/components/notification';
import selectUser from 'vj/components/selectUser';
import { AutoloadPage } from 'vj/misc/Page';
import { i18n, request, tpl } from 'vj/utils';

function handleNavLogoutClick(ev) {
  const $logoutLink = $(ev.currentTarget);
  request
    .post($logoutLink.attr('href'))
    .then(() => window.location.reload());
  ev.preventDefault();
}

async function handlerSwitchAccount(ev) {
  ev.preventDefault();
  const target = await selectUser('Hint::icon::switch_account');
  if (!target) return;
  try {
    const res = await request.get(`/account/${target._id}`);
    if (res.url) window.location.href = res.url;
    else window.location.reload();
  } catch (error) {
    Notification.error(error.message);
  }
}

let $trigger;
let $menu;

function handleNavbar() {
  let fromHide = false;
  if ($(document).width() <= 600) {
    $menu.children().each(function () {
      const $ele = $(this);
      $ele.addClass('nav__list-item').removeClass('menu__item');
      $ele.children('a').addClass('nav__item').removeClass('menu__link');
      $ele.insertBefore($trigger, null);
    });
    $trigger.hide();
    return;
  }
  $trigger.show();

  const base = 70;

  let navItems = $('.nav__list--main > .nav__list-item');
  let navItem = navItems.length - 2;
  while (navItem && $('#menu').children('div').height() > base) {
    if (!$(navItems[navItem]).children('a').hasClass('nav--active')) {
      $(navItems[navItem]).removeClass('nav__list-item').addClass('menu__item');
      $(navItems[navItem]).children('a').removeClass('nav__item').addClass('menu__link');
      $menu.prepend($(navItems[navItem]));
    }
    navItem--;
    fromHide = true;
  }

  if (!fromHide && $menu.children().length) {
    while ($('#menu').children('div').height() <= base && $menu.children().length) {
      const $ele = $menu.children().first();
      $ele.addClass('nav__list-item').removeClass('menu__item');
      $ele.children('a').addClass('nav__item').removeClass('menu__link');
      $ele.insertBefore($trigger, null);
    }
  }

  navItems = $('.nav__list--main > .nav__list-item');
  navItem = navItems.length - 2;
  if ($('#menu').children('div').height() > base) {
    while (navItem && $('#menu').children('div').height() > base) {
      if (!$(navItems[navItem]).children('a').hasClass('nav--active')) {
        $(navItems[navItem]).removeClass('nav__list-item').addClass('menu__item');
        $(navItems[navItem]).children('a').removeClass('nav__item').addClass('menu__link');
        $menu.prepend($(navItems[navItem]));
      }
      navItem--;
    }
  }

  if (!$menu.children().length) $trigger.hide();
}

const navigationPage = new AutoloadPage('navigationPage', () => {
  if (!document.getElementById('panel') || !document.getElementById('menu')) return;

  $(document).on('click', '[name="nav_logout"]', handleNavLogoutClick);
  $(document).on('click', '[name="nav_switch_account"]', handlerSwitchAccount);

  const slideout = new Slideout({
    panel: document.getElementById('panel'),
    menu: document.getElementById('menu'),
    padding: 200,
    tolerance: 70,
    side: 'right',
  });
  [['beforeopen', 'add'], ['beforeclose', 'remove']].forEach(([event, action]) => {
    slideout.on(event, () => $('.header__hamburger .hamburger')[`${action}Class`]('is-active'));
  });

  const $slideoutOverlay = $('.slideout-overlay');
  $slideoutOverlay.on('click', () => slideout.close());
  slideout.on('beforeopen', () => $slideoutOverlay.show());
  slideout.on('beforeclose', () => $slideoutOverlay.hide());

  $('.header__hamburger').on('click', () => slideout.toggle());
  $(window).on('resize', handleNavbar);
  setInterval(handleNavbar, 3000);
}, () => {
  $trigger = $(tpl`
    <li class="nav__list-item nav_more" data-dropdown-pos="bottom right" data-dropdown-target="#menu-nav-more">
      <a href="javascript:;" class="nav__item">
        ${i18n('More')} <span class="icon icon-expand_more"></span>
      </a>
    </li>
  `);
  $menu = $('<ol class="dropdown-target menu menu_more" id="menu-nav-more">');
  $trigger.append($menu);
  $('.nav__list--main').append($trigger);

  handleNavbar();
});

export default navigationPage;
