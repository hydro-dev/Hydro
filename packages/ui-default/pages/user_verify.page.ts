import { startAuthentication } from '@simplewebauthn/browser';
import $ from 'jquery';
import { ActionDialog } from 'vj/components/dialog';
import Notification from 'vj/components/notification';
import { AutoloadPage } from 'vj/misc/Page';
import { i18n, request, tpl } from 'vj/utils';

async function verifywebauthn($form) {
  if (!window.isSecureContext || !('credentials' in navigator)) {
    Notification.error(i18n('Your browser does not support WebAuthn or you are not in secure context.'));
    return null;
  }
  let uname = '';
  if ($form['uname']) uname = $form['uname'].value;
  const authnInfo = await request.get('/user/webauthn', uname ? { uname } : undefined);
  if (!authnInfo.authOptions) {
    Notification.error(i18n('Failed to fetch registration data.'));
    return null;
  }
  Notification.info(i18n('Please follow the instructions on your device to complete the verification.'));
  const result = await startAuthentication(authnInfo.authOptions)
    .catch((e) => {
      Notification.error(i18n('Failed to get credential: {0}', e));
      return null;
    });
  if (!result) return null;
  try {
    const authn = await request.post('/user/webauthn', {
      result,
    });
    if (!authn.error) return authnInfo.authOptions.challenge;
  } catch (err) {
    Notification.error(err.message);
    console.error(err);
  }
  return null;
}

async function chooseAction(authn?: boolean) {
  return await new ActionDialog({
    $body: tpl`
      <div class="typo">
        <h3>${i18n('Two Factor Authentication')}</h3>
        <p>${i18n('Your account has two factor authentication enabled. Please choose an authenticator to verify.')}</p>
        <div style="${authn ? '' : 'display:none;'}">
          <button class="expanded rounded primary button" data-action="webauthn">${i18n('Use Authenticator')}</button>
        </div>
        <div>
          <label>${i18n('6-Digit Code')}  
            <div class="textbox-container">
              <input class="textbox" type="number" name="tfa_code" autocomplete="off" data-autofocus>
            </div>
          </label>
          <button class="expanded rounded primary button" data-action="tfa">${i18n('Use TFA Code')}</button>
        </div>
      </div>
      `,
    $action: [],
    canCancel: false,
    onDispatch(action) {
      if (action === 'tfa' && $('[name="tfa_code"]').val() === '') {
        $('[name="tfa_code"]').focus();
        return false;
      }
      return true;
    },
  }).open();
}

export default new AutoloadPage('user_verify', () => {
  $(document).on('click', '[name="login_submit"]', async (ev) => {
    ev.preventDefault();
    const form = ev.currentTarget.form;
    const uname = $(form).find('[name="uname"]').val() as string;
    if (!uname) {
      form.elements.namedItem('uname')?.focus();
      return;
    }
    const { authn, tfa } = await request.get('/user/tfa', { q: uname });
    if (authn || tfa) {
      const handleKeyDown = (event) => {
        if (event.key === 'Enter') {
          const code = $('[name="tfa_code"]').val() as string;
          if (code) $('[data-action="tfa"]').trigger('click');
          else $('[data-action]').trigger('click');
        }
      };
      $(document).on('keydown', handleKeyDown);
      let action = (authn && tfa) ? await chooseAction(true) : '';
      action ||= tfa ? await chooseAction(false) : 'webauthn';
      $(document).off('keydown', handleKeyDown);
      if (action === 'webauthn') {
        const challenge = await verifywebauthn(form);
        if (challenge) form['authnChallenge'].value = challenge;
        else return;
      } else if (action === 'tfa') form['tfa'].value = $('[name="tfa_code"]').val() as string;
      else return;
    }
    form.submit();
  });
  $(document).on('click', '[name=webauthn_verify]', async (ev) => {
    ev.preventDefault();
    const $form = ev.currentTarget.form;
    if (!$form) return;
    const challenge = await verifywebauthn($form);
    if (challenge) {
      $form['authnChallenge'].value = challenge;
      $form.submit();
    }
  });
});
