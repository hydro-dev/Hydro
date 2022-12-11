import $ from 'jquery';
import QRCode from 'qrcode';
import { ActionDialog } from 'vj/components/dialog';
import Notification from 'vj/components/notification';
import { NamedPage } from 'vj/misc/Page';
import {
  api, delay, gql, i18n, tpl,
} from 'vj/utils';

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
    const secret = String.random(13, 'ABCDEFGHIJKLMNOPQRSTUVWXYZ234567');
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
});
