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
});

export default navigationPage;
