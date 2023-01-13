import $ from 'jquery';
import { ActionDialog } from 'vj/components/dialog';
import Notification from 'vj/components/notification';
import { AutoloadPage } from 'vj/misc/Page';
import {
  api, base64, gql, i18n, request, tpl,
} from 'vj/utils';

async function verifywebauthn($form) {
  if (!('credentials' in navigator)) {
    Notification.error(i18n('Your browser does not support WebAuthn or you are not in secure context.'));
    return null;
  }
  let uname = '';
  if ($form['uname']) uname = $form['uname'].value;
  const authnInfo = await request.get('/user/auth', uname ? { uname } : undefined);
  if (!authnInfo.authOptions) {
    Notification.error(i18n('Failed to fetch registration data.'));
    return null;
  }
  Notification.info(i18n('Please follow the instructions on your device to complete the verification.'));
  let credential;
  try {
    credential = await navigator.credentials.get({
      publicKey: {
        ...authnInfo.authOptions,
        challenge: Uint8Array.from(base64.decode(authnInfo.authOptions.challenge, false), (c: string) => c.charCodeAt(0)),
        allowCredentials: authnInfo.authOptions.allowCredentials.map((cred: any) => ({
          ...cred,
          id: Uint8Array.from(base64.decode(cred.id, false), (c: string) => c.charCodeAt(0)),
          transports: cred.transports ?? [],
        })),
      },
    }) as PublicKeyCredential;
  } catch (err) {
    Notification.error(i18n('Failed to get credential: {0}', err));
    return null;
  }
  const response = credential.response as AuthenticatorAssertionResponse;
  try {
    const authn = await request.post('/user/auth', {
      operation: 'verify',
      credentialId: base64.encode(String.fromCharCode(...new Uint8Array(credential.rawId)), false),
      clientDataJSON: base64.encode(String.fromCharCode(...new Uint8Array(response.clientDataJSON)), false),
      authenticatorData: base64.encode(String.fromCharCode(...new Uint8Array(response.authenticatorData)), false),
      signature: base64.encode(String.fromCharCode(...new Uint8Array(response.signature)), false),
      uname,
    });
    if (!authn.error) return authnInfo.authOptions.challenge;
  } catch (err) {
    Notification.error(err.message);
    console.error(err);
  }
  return null;
}

export default new AutoloadPage('user_verify', () => {
  $(document).on('click', '[name="login_submit"]', async (ev) => {
    ev.preventDefault();
    const $form = ev.currentTarget.form;
    const uname = $('[name="uname"]').val() as string;
    const authInfo = await api(gql`
      user(uname:${uname}){
        tfa
        authn
      }
    `, ['data', 'user']);
    if (authInfo.tfa || authInfo.authn) {
      const chooseAction = await new ActionDialog({
        $body: tpl`
          <div class="typo">
            <h3>${i18n('Two Factor Authentication')}</h3>
            <p>${i18n('Your account has two factor authentication enabled. Please choose an authenticator to verify.')}</p>
            <div style="${authInfo.authn ? '' : 'display:none;'}">
              <input value="${i18n('Use Authenticator To Login')}" class="expanded rounded primary button" data-action="webauthn" autofocus>
            </div>
            <div style="${authInfo.tfa ? '' : 'display:none;'}">
              <label>${i18n('6-Digit Code')}  
                <div class="textbox-container">
                  <input class="textbox" type="text" name="tfa_code" autocomplete="off" autofocus>
                </div>
              </label>
              <input value="${i18n('Use TFA Code To Login')}" class="expanded rounded primary button" data-action="tfa">
            </div>
          </div>
          `,
        $action: [],
        onDispatch(action) {
          if (action === 'tfa' && $('[name="tfa_code"]').val() === null) {
            $('[name="tfa_code"]').focus();
            return false;
          }
          return true;
        },
      }).open();
      if (chooseAction === 'tfa') {
        if (!authInfo.tfa) {
          Notification.error(i18n('TFA is not enabled.'));
          return;
        }
        $form['tfa'].value = $('[name="tfa_code"]').val() as string;
      } else if (chooseAction === 'webauthn') {
        if (!authInfo.authn) {
          Notification.error(i18n('WebAuthn is not enabled.'));
          return;
        }
        const challenge = await verifywebauthn($form);
        if (challenge) {
          $form['authnChallenge'].value = challenge;
        } else {
          return;
        }
      }
    }
    $form.submit();
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
