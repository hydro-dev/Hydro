import $ from 'jquery';
import QRCode from 'qrcode';
import { ActionDialog } from 'vj/components/dialog';
import Notification from 'vj/components/notification';
import { NamedPage } from 'vj/misc/Page';
import {
  base64, delay, i18n, request, tpl,
} from 'vj/utils';

export default new NamedPage('home_security', () => {
  $(document).on('click', '[name="auth_enable"]', async () => {
    const supportWebauthn = 'credentials' in navigator;
    const authnInfo = supportWebauthn ? await request.post('/user/auth', { operation: 'register' }) : null;
    const chooseAction = await new ActionDialog({
      $body: tpl`
        <div>
          <h3>${i18n('Choose Authenticator Type')}</h3>
          <ol class="menu">
            <li class="menu__item" id="menu-item-TFA">
              <a class="menu__link" data-action="tfa">
                  <span class="icon icon-platform--mobile"></span>
                ${i18n('Two Factor Authentication')}
              </a>
            </li>
            <li class="menu__seperator"></li>
            <li class="menu__item" id="menu-item-home_messages">
              <a class="menu__link" data-action="platform">
                  <span class="icon icon-fingerprint"></span>
                ${i18n('Your Device')}
              </a>
            </li>
            <li class="menu__item" id="menu-item-home_messages">
              <a class="menu__link" data-action="cross-platform">
                  <span class="icon icon-usb"></span>
                ${i18n('Multi Platform Authenticator')}
              </a>
            </li>
          </ol>
        </div>
      `,
      $action: [],
    }).open();
    if (chooseAction === 'tfa') {
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
      const secret = String.random(13, 'ABCDEFGHIJKLMNOPQRSTUVWXYZ234567');
      $('#secret').on('click', () => $('#secret').html(secret));
      const uri = `otpauth://totp/Hydro:${UserContext.uname}?secret=${secret}&issuer=Hydro`;
      const canvas = document.getElementById('qrcode');
      await QRCode.toCanvas(canvas, uri);
      const tfaAction = await enableTFA;
      if (tfaAction !== 'ok') return;
      const authn = await request.post('/user/auth', {
        operation: 'enable',
        type: 'tfa',
        code: $('[name="tfa_code"]').val(),
        secret,
      });
      if (authn.error) {
        Notification.error(authn.error);
        return;
      }
      Notification.success(i18n('Successfully enabled.'));
      await delay(2000);
      window.location.reload();
    } else if (['platform', 'cross-platform'].includes(chooseAction)) {
      if (!supportWebauthn) {
        Notification.error(i18n('Your browser does not support WebAuthn or you are not in secure context.'));
        return;
      }
      if (!authnInfo.authOptions) {
        Notification.error(i18n('Failed to fetch registration data.'));
        return;
      }
      let credential;
      try {
        credential = await navigator.credentials.create({
          publicKey: {
            ...authnInfo.authOptions,
            challenge: Uint8Array.from(base64.decode(authnInfo.authOptions.challenge, false), (c: string) => c.charCodeAt(0)),
            user: {
              ...authnInfo.authOptions.user,
              id: Uint8Array.from(authnInfo.authOptions.user.id, (c: string) => c.charCodeAt(0)),
            },
            excludeCredentials: authnInfo.authOptions.excludeCredentials.map((excludeCredential: any) => ({
              ...excludeCredential,
              id: Uint8Array.from(excludeCredential.id, (c: string) => c.charCodeAt(0)),
            })),
            authenticatorSelection: {
              authenticatorAttachment: chooseAction,
            },
          },
        }) as PublicKeyCredential;
      } catch (err) {
        Notification.error([i18n('Failed to get credential:'), err].join(' '));
        return;
      }
      const response = credential.response as AuthenticatorAttestationResponse;
      let transports = null;
      if (typeof response.getTransports === 'function') {
        transports = response.getTransports().join(',');
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
      const authn = await request.post('/user/auth', {
        operation: 'enable',
        type: 'authn',
        credentialId: base64.encode(String.fromCharCode(...new Uint8Array(credential.rawId)), false),
        credentialName: $('[name="webauthn_name"]').val(),
        credentialType: credential.type,
        clientDataJSON: base64.encode(String.fromCharCode(...new Uint8Array(response.clientDataJSON)), false),
        attestationObject: base64.encode(String.fromCharCode(...new Uint8Array(response.attestationObject)), false),
        transports,
        authenticatorAttachment: credential.authenticatorAttachment ?? '',
      });
      if (authn.error) {
        Notification.error(authn.error);
        return;
      }
      Notification.success(i18n('Successfully enabled.'));
      await delay(2000);
      window.location.reload();
    }
  });
  $(document).on('click', '[name="tfa_disable"]', async (ev) => {
    ev.preventDefault();
    const op = await new ActionDialog({
      $body: tpl`
        <div class="typo">
          <label>${i18n('6-Digit Code')}  
            <div class="textbox-container">
              <input class="textbox" type="text" name="tfa_code" data-focus autocomplete="off"></input>
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
    if (op !== 'ok') return;
    const $form = ev.currentTarget.form;
    $form['code'].value = $('[name="tfa_code"]').val();
    $form.submit();
  });
});
