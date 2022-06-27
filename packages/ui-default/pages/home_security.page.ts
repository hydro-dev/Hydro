import { NamedPage } from 'vj/misc/Page';
import QRCode from 'qrcode';
import b32 from 'thirty-two';
import base64url from 'base64url';
import Notification from 'vj/components/notification';
import i18n from 'vj/utils/i18n';
import tpl from 'vj/utils/tpl';
import { ActionDialog } from 'vj/components/dialog';
import api, { gql } from 'vj/utils/api';
import delay from 'vj/utils/delay';

export default new NamedPage('home_security', () => {
  $(document).on('click', '[name="tfa_enable"]', async () => {
    const result = new ActionDialog({
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
    const secret = b32.encode(crypto.getRandomValues(new Uint8Array(8)))
      .toString('utf8').replace(/=/g, '').toUpperCase();
    $('#secret').on('click', () => $('#secret').html(secret));
    const uri = `otpauth://totp/Hydro:${UserContext.uname}?secret=${secret}&issuer=Hydro`;
    const canvas = document.getElementById('qrcode');
    await QRCode.toCanvas(canvas, uri);
    const action = await result;
    if (action !== 'ok') return;
    try {
      await api(gql`
        user {
          TFA {
            enable(code: ${$('[name="tfa_code"]').val()}, secret: ${secret})
          }
        }
      `);
      Notification.success(i18n('Successfully enabled.'));
      await delay(2000);
      window.location.reload();
    } catch (e) {
      Notification.error(e.message);
    }
  });
  $(document).on('click', '[name="tfa_enabled"]', async () => {
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
    try {
      await api(gql`
        user {
          TFA {
            disable(code: ${$('[name="tfa_code"]').val()})
          }
        }
      `);
      Notification.success(i18n('Successfully disabled.'));
      await delay(2000);
      window.location.reload();
    } catch (e) {
      Notification.error(e.message);
    }
  });

  function publicKeyCredentialToJSON(pubKeyCred) {
    if (pubKeyCred instanceof Array) {
      const arr = [];
      for (const i of pubKeyCred) { arr.push(publicKeyCredentialToJSON(i)); }

      return arr;
    }

    if (pubKeyCred instanceof ArrayBuffer) {
      return base64url.encode(pubKeyCred);
    }

    if (pubKeyCred instanceof Object) {
      const obj = {};

      for (const key in pubKeyCred) {
        obj[key] = publicKeyCredentialToJSON(pubKeyCred[key]);
      }

      return obj;
    }

    return pubKeyCred;
  }

  $('#delete_authenticators').off('click').on('click', async () => {
    await api(gql`
    user {
      WebAuthn {
        delete(_: "")
      }
    }
    `, ['data', 'user', 'WebAuthn', 'delete']);
    Notification.success(i18n('Successfully deleted.'));
    await delay(2000);
    window.location.reload();
  });

  $('#register_authenticators').off('click').on('click', async () => {
    let t = await api(gql`
    user {
      WebAuthn {
        register(_: "")
      }
    }
    `, ['data', 'user', 'WebAuthn', 'register']);
    const { token, makeCredential } = JSON.parse(t);

    makeCredential.challenge = base64url.toBuffer(makeCredential.challenge);
    makeCredential.user.id = base64url.toBuffer(makeCredential.user.id);

    const n = await navigator.credentials.create({ publicKey: makeCredential });
    const response = JSON.stringify(publicKeyCredentialToJSON(n));

    t = await api(gql`
    user {
      WebAuthn {
        response(token: ${token}, data: ${response})
      }
    }
    `, ['data', 'user', 'WebAuthn', 'response']);

    Notification.success(i18n('Successfully add.'));
    await delay(2000);
    window.location.reload();
  });
});
