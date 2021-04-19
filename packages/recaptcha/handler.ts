import superagent from 'superagent';
import { ValidationError, ForbiddenError } from 'hydrooj/dist/error';
import { PRIV } from 'hydrooj/dist/model/builtin';
import * as system from 'hydrooj/dist/model/system';
import * as bus from 'hydrooj/dist/service/bus';

bus.on('handler/before/UserRegister', async (thisArg) => {
    if (!system.get('recaptcha.key')) return;
    if (thisArg.request.method !== 'post') {
        thisArg.UiContext.recaptchaKey = system.get('recaptcha.key');
        return;
    }
    if (thisArg.user.hasPriv(PRIV.PRIV_UNLIMITED_ACCESS)) return;
    if (!thisArg.args.captcha) throw new ValidationError('captcha');
    const response = await superagent.post('https://recaptcha.net/recaptcha/api/siteverify')
        .field('secret', system.get('recaptcha.secret'))
        .field('response', thisArg.args.captcha)
        .field('remoteip', thisArg.request.ip);
    if (!response.body.success) throw new ForbiddenError('captcha fail');
});

bus.on('handler/after/UserRegister', async (thisArg) => {
    thisArg.response.body.captcha = `\
    <script src="https://recaptcha.net/recaptcha/api.js?render=${system.get('recaptcha.key')}"></script>
    <input type="text" name="captcha" id="_captcha" style="display:none">
    <input type="submit" id="_submit" style="display:none">`;
});
