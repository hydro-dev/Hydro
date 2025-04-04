import { createHash, createHmac } from 'crypto';
import {
    Context, ForbiddenError, Handler, Schema, Service,
} from 'hydrooj';

// from https://www.svgrepo.com/svg/333610/telegram
// eslint-disable-next-line max-len
const icon = '<svg viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg"><path d="m20.665 3.717-17.73 6.837c-1.21.486-1.203 1.161-.222 1.462l4.552 1.42 10.532-6.645c.498-.303.953-.14.579.192l-8.533 7.701h-.002l.002.001-.314 4.692c.46 0 .663-.211.921-.46l2.211-2.15 4.599 3.397c.848.467 1.457.227 1.668-.785l3.019-14.228c.309-1.239-.473-1.8-1.282-1.434z"/></svg>';

export default class TelegramService extends Service {
    static inject = ['oauth'];
    static Config = Schema.object({
        token: Schema.string().role('secret').required(),
        botLogin: Schema.string().required(),
        endpoint: Schema.string().default('https://api.telegram.org/bot'),
        canRegister: Schema.boolean().default(false),
    });

    constructor(ctx: Context, config: ReturnType<typeof TelegramService.Config>) {
        super(ctx, 'oauth.telegram');
        ctx.oauth.provide('telegram', {
            text: 'Login with Telegram',
            name: 'Telegram',
            icon,
            canRegister: config.canRegister,
            callback: async function callback({ payload }) {
                let parsed;
                try {
                    parsed = JSON.parse(payload);
                } catch (e) {
                    throw new ForbiddenError('Invalid payload');
                }
                const hash = parsed.hash;
                delete parsed.hash;
                const dataCheckString = Object.keys(parsed).sort().map((key) => (`${key}=${parsed[key]}`)).join('\n');
                const secretKey = createHash('sha256').update(config.token).digest();
                const dataCheckSum = createHmac('sha256', secretKey).update(dataCheckString).digest('hex');
                if (hash !== dataCheckSum) throw new ForbiddenError('Invalid hash');
                const {
                    id, first_name, last_name, username, photo_url,
                } = parsed;
                const ret = {
                    _id: id,
                    email: `${id}@telegram.local`,
                    bio: '',
                    uname: [`${first_name} ${last_name}`, username, `telegram${id.toString()}`].filter((i) => i),
                    avatar: `url:${photo_url}`,
                };
                if (!ret.email) throw new ForbiddenError("You don't have a verified email.");
                return ret;
            },
            async get(this: Handler) {
                this.response.body = { botLogin: config.botLogin };
                this.response.template = 'telegram_login.html';
            },
        });
        ctx.i18n.load('zh', {
            'Login With Telegram': '使用 Telegram 登录',
        });
    }
}
