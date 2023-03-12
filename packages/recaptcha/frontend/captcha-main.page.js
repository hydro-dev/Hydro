import { addPage, NamedPage } from '@hydrooj/ui-default';
/* global grecaptcha */

addPage(new NamedPage('user_register', () => {
  function captcha(event) {
    event.preventDefault();
    grecaptcha.ready(() => {
      grecaptcha.execute(UiContext.recaptchaKey, { action: 'submit' }).then((token) => {
        document.getElementById('_captcha').value = token;
        document.getElementById('_submit').click();
      });
    });
  }
  const element = document.getElementById('submit');
  if (element) element.onclick = captcha;
}));
