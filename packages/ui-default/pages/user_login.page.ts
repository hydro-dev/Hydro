import { AutoloadPage } from 'vj/misc/Page';
import api, { gql } from 'vj/utils/api';
import Notification from 'vj/components/notification';
import i18n from 'vj/utils/i18n';

let getAssertion;
let token = '';

function publicKeyCredentialToJSON(pubKeyCred) {
  if (pubKeyCred instanceof Array) {
    const arr = [];
    for (const i of pubKeyCred) { arr.push(publicKeyCredentialToJSON(i)); }

    return arr;
  }

  if (pubKeyCred instanceof ArrayBuffer) {
    return Buffer.from(pubKeyCred).toString('base64');
  }

  if (pubKeyCred instanceof Object) {
    const obj = {};

    for (const key in pubKeyCred) {
      if (Object.prototype.hasOwnProperty.call(pubKeyCred, key)) {
        obj[key] = publicKeyCredentialToJSON(pubKeyCred[key]);
      }
    }

    return obj;
  }

  return pubKeyCred;
}

export default new AutoloadPage('user_login', (pagename) => {
  (pagename === 'user_login' ? $(document) : $('.dialog--signin__main')).on('blur', '[name="uname"]', async () => {
    const uname = $('[name="uname"]').val() as string;
    if (uname.length > 0) {
      const auth = await api(gql`
        user(uname:${uname}){
          tfa,
          webauthn
        }
      `, ['data', 'user']);
      if (auth.webauthn) {
        if (typeof getAssertion === 'undefined') {
          const r = await api(gql`
          user{
            WebAuthn
            {
              login(uname:${uname})
            }
          }
          `, ['data', 'user', 'WebAuthn', 'login']);
          ({ token, getAssertion } = JSON.parse(r));

          $("input[name='webauthnToken']").val(token);
        }
        $('.webauthn_btn').show();
        $('.use_password_btn').show();
        $('.pass_div').hide();
        $('.tfa_div').hide();
        $('.login_submit').hide();
      } else {
        $('.use_password_btn').hide();
        $('.pass_div').show();
        $('.webauthn_btn').hide();
        if (auth.tfa) $('.tfa_div').show();
        else $('.tfa_div').hide();
      }
    }
    $('.use_password_btn').off('click').on('click', () => {
      $('.use_password_btn').hide();
      $('.webauthn_btn').hide();
      $('.pass_div').show();
      $('.tfa_div').show();
      $('.login_submit').show();
    });
    $('.webauthn_btn').off('click').on('click', async () => {
      getAssertion.challenge = Buffer.from(getAssertion.challenge, 'base64');
      getAssertion.allowCredentials[0].id = Buffer.from(getAssertion.allowCredentials[0].id, 'base64');

      try {
        const n = await navigator.credentials.get({ publicKey: getAssertion });
        const response = publicKeyCredentialToJSON(n);
        $('input[name="webauthnResponse"]').val(JSON.stringify(response));
        $('input[name="webauthnToken"]').val(token);
        $('.webauthn_btn').hide();
        $('.use_password_btn').hide();
        $('.login_submit').trigger('click');
      } catch (e) {
        Notification.error(i18n('The operation either timed out or was not allowed.'));
      }
    });
  });
});
