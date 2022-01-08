import Slideout from 'slideout';
import createHint from 'vj/components/hint';
import tpl from 'vj/utils/tpl';
import i18n from 'vj/utils/i18n';
import request from 'vj/utils/request';
import { ActionDialog } from 'vj/components/dialog';
import Notification from 'vj/components/notification';
import UserSelectAutoComplete from 'vj/components/autocomplete/UserSelectAutoComplete';
import { AutoloadPage } from 'vj/misc/Page';

function handleNavLogoutClick(ev) {
  const $logoutLink = $(ev.currentTarget);
  request
    .post($logoutLink.attr('href'))
    .then(() => window.location.reload());
  ev.preventDefault();
}

function handlerSwitchAccount(ev) {
  let userSelector;
  const promise = new ActionDialog({
    $body: tpl`
      <div>
        <div class="row"><div class="columns">
          <h1 name="select_user_text">${i18n('Select User')}</h1>
        </div></div>
        <div class="row">
          <div class="columns">
            <label>
              ${i18n('Username / UID')}
              <input name="switch_account_target" type="text" class="textbox" autocomplete="off" data-autofocus>
            </label>
          </div>
        </div>
      </div>
    `,
    onDispatch(action) {
      console.log(action, userSelector.value());
      if (action === 'ok' && userSelector.value() === null) {
        userSelector.focus();
        return false;
      }
      return true;
    },
  }).open();
  userSelector = UserSelectAutoComplete.getOrConstruct($('[name="switch_account_target"]'));
  createHint('Hint::icon::switch_account', $('[name="select_user_text"]'));
  promise.then(async (action) => {
    if (action !== 'ok') return;
    const target = userSelector.value();
    if (!target) return;
    try {
      await request.get('/account', { uid: target._id });
      window.location.reload();
    } catch (error) {
      Notification.error(error.message);
    }
  });
  ev.preventDefault();
}

let trigger;
let menu;

function handleNavbar() {
  let fromHide = false;
  if ($(document).width() <= 600) {
    for (const ele of menu.children()) {
      ele.insertBefore(trigger);
    }
    trigger.hide();
    return;
  }
  trigger.show();

  let navItems = $('.nav__list--main > .nav__list-item');
  let navItem = navItems.length - 2;
  while (navItem && $('#menu').children('div').height() > 45) {
    if (!$(navItems[navItem]).children('a').hasClass('nav--active')) {
      $(navItems[navItem]).removeClass('nav__list-item').addClass('menu__item');
      $(navItems[navItem]).children('a').removeClass('nav__item').addClass('menu__link');
      $(menu).prepend($(navItems[navItem]));
    }
    navItem--;
    fromHide = true;
  }

  if (!fromHide && menu.children().length) {
    while ($('#menu').children('div').height() <= 45 && menu.children().length) {
      const ele = menu.children(0);
      $(ele).addClass('nav__list-item').removeClass('menu__item');
      $(ele).children('a').addClass('nav__item').removeClass('menu__link');
      ele.insertBefore(trigger);
    }
  }

  navItems = $('.nav__list--main > .nav__list-item');
  navItem = navItems.length - 2;
  if ($('#menu').children('div').height() > 45) {
    while (navItem && $('#menu').children('div').height() > 45) {
      if (!$(navItems[navItem]).children('a').hasClass('nav--active')) {
        $(navItems[navItem]).removeClass('nav__list-item').addClass('menu__item');
        $(navItems[navItem]).children('a').removeClass('nav__item').addClass('menu__link');
        $(menu).prepend($(navItems[navItem]));
        break;
      }
      navItem--;
    }
  }

  if (!menu.children().length) trigger.hide();
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
  $slideoutOverlay.click(() => slideout.close());
  slideout.on('beforeopen', () => $slideoutOverlay.show());
  slideout.on('beforeclose', () => $slideoutOverlay.hide());

  $('.header__hamburger').click(() => slideout.toggle());
  $(window).on('resize', handleNavbar);
}, () => {
  trigger = $(tpl`
    <li class="nav__list-item nav_more" data-dropdown-pos="bottom right" data-dropdown-target="#menu-nav-more">
      <a href="javascript:;" class="nav__item">
        ${i18n('More')} <span class="icon icon-expand_more"></span>
      </a>
    </li>
  `);
  menu = $('<ol class="dropdown-target menu menu_more" id="menu-nav-more">');
  trigger.append(menu);
  $('.nav__list--main').append(trigger);
  handleNavbar();
});

export default navigationPage;
