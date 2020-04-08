import _ from 'lodash';
import Slideout from 'slideout';

import { AutoloadPage } from 'vj/misc/PageLoader';
import request from 'vj/utils/request';
import responsiveCutoff from 'vj/breakpoints.json';
import { isAbove } from 'vj/utils/mediaQuery';
import Navigation from '.';


const nav = Navigation.instance;
const { $nav } = nav;

function handleScroll() {
  const currentState = $(window).scrollTop() > 20;
  if (nav.floating.get('nonTop') !== currentState) {
    nav.floating.set('nonTop', currentState);
    nav.logoVisible.set('nonTop', currentState);
  }
}

function handleNavLogoutClick(ev) {
  const $logoutLink = $(ev.currentTarget);
  request
    .post($logoutLink.attr('href'))
    .then(() => window.location.reload());
  ev.preventDefault();
}

const navigationPage = new AutoloadPage('navigationPage', () => {
  if (!document.getElementById('panel') || !document.getElementById('menu')) {
    return;
  }
  if ($nav.length > 0
    && document.documentElement.getAttribute('data-layout') === 'basic'
    && isAbove(responsiveCutoff.mobile)
  ) {
    $(window).on('scroll', _.throttle(handleScroll, 100));
    $nav.hover(
      () => nav.floating.set('hover', true),
      () => nav.floating.set('hover', false),
    );
    $nav.on('vjDropdownShow', () => nav.floating.set('dropdown', true));
    $nav.on('vjDropdownHide', () => nav.floating.set('dropdown', false));
    handleScroll();
  }

  $(document).on('click', '[name="nav_logout"]', handleNavLogoutClick);

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
});

export default navigationPage;
