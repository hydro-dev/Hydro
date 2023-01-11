import $ from 'jquery';
import Notification from 'vj/components/notification';
import { AutoloadPage } from 'vj/misc/Page';
import {
  api, base64, gql, i18n, request,
} from 'vj/utils';

export default new AutoloadPage('user_verify', (pagename) => {
  (pagename === 'user_login' ? $(document) : $('.dialog--signin__main')).on('blur', '[name="uname"]', async () => {
    const uname = $('[name="uname"]').val() as string;
    if (uname.length > 0) {
      const tfa = await api(gql`
        user(uname:${uname}){
          tfa
          authn
        }
      `, ['data', 'user']);
      if (tfa?.tfa) $('#tfa_div').show();
      else $('#tfa_div').hide();
      if (tfa?.authn) $('#authn_div').show();
      else $('#authn_div').hide();
    }
  });
  $(document).on('click', '[name=webauthn_verify]', async (ev) => {
    ev.preventDefault();
    if (!('credentials' in navigator)) {
      Notification.error(i18n('Your browser does not support WebAuthn or you are not in secure context.'));
      return;
    }
    const $form = ev.currentTarget.form;
    let uname = '';
    if ($form['uname']) uname = $form['uname'].value;
    const authnInfo = await request.get('/user/auth', uname ? { uname } : undefined);
    if (!authnInfo.authOptions) {
      Notification.error(i18n('Failed to fetch registration data.'));
      return;
    }
    if ($form['authnCredentialId']) {
      authnInfo.authOptions.allowCredentials = authnInfo.authOptions.allowCredentials.filter(
        (cred: any) => cred.id === $form['authnCredentialId'].value,
      );
    }
    let credential;
    try {
      credential = await navigator.credentials.get({
        publicKey: {
          ...authnInfo.authOptions,
          challenge: Uint8Array.from(base64.decode(authnInfo.authOptions.challenge, false), (c: string) => c.charCodeAt(0)),
          allowCredentials: authnInfo.authOptions.allowCredentials.map((cred: any) => ({
            ...cred,
            id: Uint8Array.from(base64.decode(cred.id, false), (c: string) => c.charCodeAt(0)),
          })),
        },
      }) as PublicKeyCredential;
    } catch (err) {
      Notification.error([i18n('Failed to get credential:'), err].join(' '));
      return;
    }
    const response = credential.response as AuthenticatorAssertionResponse;
    const authn = await request.post('/user/auth', {
      operation: 'verify',
      credentialId: base64.encode(String.fromCharCode(...new Uint8Array(credential.rawId)), false),
      clientDataJSON: base64.encode(String.fromCharCode(...new Uint8Array(response.clientDataJSON)), false),
      authenticatorData: base64.encode(String.fromCharCode(...new Uint8Array(response.authenticatorData)), false),
      signature: base64.encode(String.fromCharCode(...new Uint8Array(response.signature)), false),
      uname,
    });
    if (authn.error) {
      Notification.error(authn.error);
      return;
    }
    $form['authnChallenge'].value = authnInfo.authOptions.challenge;
    $form.submit();
  });
});
