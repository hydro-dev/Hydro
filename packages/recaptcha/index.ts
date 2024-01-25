import {
    Context, ForbiddenError, PRIV, superagent, SystemModel, ValidationError,
} from 'hydrooj';

export function apply(ctx: Context) {
    ctx.on('handler/before/UserRegister', async (thisArg) => {
        if (!SystemModel.get('recaptcha.key')) return;
        if (thisArg.request.method !== 'post') {
            thisArg.UiContext.recaptchaKey = SystemModel.get('recaptcha.key');
            return;
        }
        if (thisArg.user.hasPriv(PRIV.PRIV_UNLIMITED_ACCESS)) return;
        if (!thisArg.args.captcha) throw new ValidationError('captcha');
        const response = await superagent.post('https://recaptcha.net/recaptcha/api/siteverify')
            .field('secret', SystemModel.get('recaptcha.secret'))
            .field('response', thisArg.args.captcha)
            .field('remoteip', thisArg.request.ip);
        if (!response.body.success) throw new ForbiddenError('Failed to solve the captcha.');
    });

    ctx.on('handler/after/UserRegister', async (thisArg) => {
        thisArg.response.body.captcha = `\
<script src="https://recaptcha.net/recaptcha/api.js?render=${SystemModel.get('recaptcha.key')}"></script>
<input type="text" name="captcha" id="_captcha" style="display:none">
<input type="submit" id="_submit" style="display:none">`;
    });

    ctx.i18n.load('zh', {
        'Failed to solve the captcha': '没有通过 ReCaptcha 验证。',
    });
}
