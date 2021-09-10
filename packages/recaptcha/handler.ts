import superagent from 'superagent';
import { ForbiddenError, ValidationError } from 'hydrooj/src/error';
import { PRIV } from 'hydrooj/src/model/builtin';
import * as system from 'hydrooj/src/model/system';
import * as bus from 'hydrooj/src/service/bus';

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
