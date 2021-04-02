(() => {
    const { NamedPage } = window.Hydro;

    const page = new NamedPage('user_register', () => {
        function captcha(event) {
            event.preventDefault();
            grecaptcha.ready(function () {
                grecaptcha.execute(UiContext.recaptchaKey, { action: 'submit' }).then(function (token) {
                    document.getElementById('_captcha').value = token;
                    document.getElementById('_submit').click();
                });
            });
        }
        const element = document.getElementById('submit');
        if (element) element.onclick = captcha;
    });

    window.Hydro.extraPages.push(page);
})();