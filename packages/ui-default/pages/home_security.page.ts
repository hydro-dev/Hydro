import { browserSupportsWebAuthn, platformAuthenticatorIsAvailable, startRegistration } from '@simplewebauthn/browser';
import $ from 'jquery';
import { escape } from 'lodash';
import QRCode from 'qrcode';
import { ActionDialog } from 'vj/components/dialog';
import Notification from 'vj/components/notification';
import { NamedPage } from 'vj/misc/Page';
import {
  delay, i18n, request, secureRandomString, tpl,
} from 'vj/utils';

const t = (s) => escape(i18n(s));

async function enableTfa() {
  const enableTFA = new ActionDialog({
    $body: tpl`
      <div class="typo">
        <p>${i18n('Please use your two factor authentication app to scan the qrcode below:')}</p>
        <div style="text-align: center">
          <canvas id="qrcode"></canvas>
          <p id="secret">${i18n('Click to show secret')}</p>
        </div>
        <label>${i18n('6-Digit Code')}  
          <div class="textbox-container">
            <input class="textbox" type="text" name="tfa_code" data-autofocus autocomplete="off"></input>
          </div>
        </label>
      </div>
    `,
    onDispatch(action) {
      if (action === 'ok' && $('[name="tfa_code"]').val() === null) {
        $('[name="tfa_code"]').focus();
        return false;
      }
      return true;
    },
  }).open();
  const secret = secureRandomString(13, 'ABCDEFGHIJKLMNOPQRSTUVWXYZ234567');
  $('#secret').on('click', () => $('#secret').html(secret));
  const uri = `otpauth://totp/Hydro:${UserContext.uname}?secret=${secret}&issuer=Hydro`;
  const canvas = document.getElementById('qrcode');
  await QRCode.toCanvas(canvas, uri);
  const tfaAction = await enableTFA;
  if (tfaAction !== 'ok') return;
  try {
    await request.post('', {
      operation: 'enable_tfa',
      code: $('[name="tfa_code"]').val(),
      secret,
    });
  } catch (err) {
    Notification.error(err.message);
    console.error(err);
    return;
  }
  Notification.success(i18n('Successfully enabled.'));
  await delay(2000);
  window.location.reload();
}

async function enableAuthn(type: string) {
  const authnInfo = await request.post('', { operation: 'register', type });
  if (!authnInfo.authOptions) {
    Notification.error(i18n('Failed to fetch registration data.'));
    return;
  }
  Notification.info(i18n('Please follow the instructions on your device to complete the verification.'));
  let credential;
  try {
    console.log(authnInfo);
    credential = await startRegistration(authnInfo.authOptions);
  } catch (err) {
    Notification.error(i18n('Failed to get credential: {0}', err));
    return;
  }
  const op = await new ActionDialog({
    $body: tpl`
      <div class="typo">
        <label>${i18n('Name')}
          <div class="textbox-container">
            <input class="textbox" type="text" name="webauthn_name" data-focus autocomplete="off"></input>
          </div>
        </label>
      </div>
    `,
    onDispatch(action) {
      if (action === 'ok' && $('[name="webauthn_name"]').val() === null) {
        $('[name="webauthn_name"]').focus();
        return false;
      }
      return true;
    },
  }).open();
  if (op !== 'ok') return;
  try {
    await request.post('', {
      operation: 'enable_authn',
      name: $('[name="webauthn_name"]').val(),
      result: credential,
    });
  } catch (err) {
    Notification.error(err.message);
    console.error(err);
    return;
  }
  Notification.success(i18n('Successfully enabled.'));
  await delay(2000);
  window.location.reload();
}

export default new NamedPage('home_security', () => {
  const menuLink = (inner: string, action?: string) => `
    <li class="menu__item" ${action ? '' : 'disabled'}>
      <a class="menu__link" ${action ? `data-action="${action}"` : 'disabled'}>${inner}</a>
    </li>
  `;
  const fingerprint = '<span class="icon icon-fingerprint"></span>';

  $(document).on('click', '[name="auth_enable"]', async () => {
    let $body = `
      <div>
        <h3>${t('Choose Authenticator Type')}</h3>
        <ol class="menu">
          ${menuLink(`<span class="icon icon-platform--mobile"></span>${t('Two Factor Authentication')}`, 'tfa')}
          <li class="menu__seperator"></li>
    `;
    if (!window.isSecureContext || !browserSupportsWebAuthn()) {
      const message = window.isSecureContext
        ? "Your browser doesn't support WebAuthn."
        : 'Webauthn is not available in insecure context.';
      $body += menuLink(`${fingerprint}${t(message)}`);
    } else {
      if (!await platformAuthenticatorIsAvailable()) {
        $body += menuLink(`${fingerprint}${t("Your browser doesn't support platform authenticator.")}`);
      } else {
        $body += menuLink(`${fingerprint}${t('Your Device')}`, 'platform');
      }
      $body += menuLink(`<span class="icon icon-usb"></span>${t('Multi Platform Authenticator')}`, 'cross-platform');
    }
    $body += '</ol></div>';
    const action = await new ActionDialog({ $body, $action: [] }).open();
    if (!action || action === 'cancel') return;
    if (action === 'tfa') enableTfa();
    else enableAuthn(action);
  });
});
