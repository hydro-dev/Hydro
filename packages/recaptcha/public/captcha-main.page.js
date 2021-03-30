(() => {
    const { AutoloadPage } = window.Hydro;

    const page = new AutoloadPage('recaptcha', () => {
        function captcha(event) {
            event.preventDefault();
            grecaptcha.ready(function () {
                grecaptcha.execute(UiContext.recaptchaKey, { action: 'submit' }).then(function (token) {
                    document.getElementById('_captcha').value = token;
                    document.getElementById('_submit').click();
                });
            });
        }
        document.getElementById('submit').onclick = captcha;
    });

    window.Hydro.extraPages.push(page);
})();