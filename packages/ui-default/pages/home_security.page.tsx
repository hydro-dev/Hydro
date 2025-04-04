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

async function changeMail() {
  const changeMailDialog = new ActionDialog({
    $body: tpl(
      <div className="typo" id="change-mail-dialog">
        <label>{i18n('Current Password')}
          <div className="textbox-container">
            <input className="textbox" type="password" name="password" data-autofocus required></input>
          </div>
        </label>
        <label>{i18n('Current Email')}
          <div className="textbox-container">
            <input className="textbox" type="text" name="currentEmail" value={UserContext.mail} disabled></input>
          </div>
        </label>
        <label>{i18n('New Email')}
          <div className="textbox-container">
            <input className="textbox" type="text" name="mail" required></input>
          </div>
        </label>
      </div>
    ),
    onDispatch(action) {
      if (action === 'ok') {
        const $password = $('#change-mail-dialog [name="password"]');
        const $mail = $('#change-mail-dialog [name="mail"]');
        if (!$password.val() || !$mail.val()) {
          if (!$password.val()) $password.focus();
          else $mail.focus();
          return false;
        }
      }
      return true;
    },
  }).open();
  const action = await changeMailDialog;
  if (action !== 'ok') return;
  try {
    await request.post('', {
      operation: 'change_mail',
      password: $('[name="password"]').val(),
      mail: $('[name="mail"]').val(),
    });
  } catch (err) {
    Notification.error(err.message);
    console.error(err);
    return;
  }
  Notification.success(i18n('Successfully changed.'));
  await delay(2000);
  window.location.reload();
}

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
    credential = await startRegistration({ optionsJSON: authnInfo.authOptions });
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
  const MenuLink = ({ children, action, icon }: { children: React.ReactNode, action?: string, icon?: string }) => (
    <li className={`menu__item ${action ? '' : 'disabled'}`}>
      <a className={`menu__link ${action ? '' : 'disabled'}`} data-action={action}>
        {icon && <span className={`icon icon-${icon}`} />}
        {children}
      </a>
    </li>
  );

  $(document).on('click', '[name="auth_enable"]', async () => {
    const platformAvailable = browserSupportsWebAuthn() && await platformAuthenticatorIsAvailable();
    const $body = tpl(
      <div>
        <h3>{i18n('Choose Authenticator Type')}</h3>
        <ol className="menu">
          <MenuLink action="tfa" icon="platform--mobile">
            {i18n('Two Factor Authentication')}
          </MenuLink>
          <li className="menu__seperator"></li>
          {(!window.isSecureContext || !browserSupportsWebAuthn()) ? (
            <MenuLink icon="fingerprint">
              {window.isSecureContext
                ? i18n("Your browser doesn't support WebAuthn.")
                : i18n('Webauthn is not available in insecure context.')}
            </MenuLink>
          ) : (<>
            {platformAvailable ? (
              <MenuLink action="platform" icon="fingerprint">
                {i18n('Your Device')}
              </MenuLink>
            ) : (
              <MenuLink icon="fingerprint">
                {i18n("Your browser doesn't support platform authenticator.")}
              </MenuLink>
            )}
            <MenuLink action="cross-platform" icon="usb">
              {i18n('Multi Platform Authenticator')}
            </MenuLink>
          </>)}
        </ol>
      </div>
    );
    const action = await new ActionDialog({ $body, $action: [] }).open();
    if (!action || action === 'cancel') return;
    if (action === 'tfa') enableTfa();
    else enableAuthn(action);
  });

  $(document).on('click', '[data-operation="change_mail"]', async (ev) => {
    ev.preventDefault();
    await changeMail();
  });
});
