import {
    Context, Handler, Schema, Service, superagent, SystemModel, TokenModel, UserFacingError,
} from 'hydrooj';

function unescapedString(escapedString: string) {
    escapedString += Array.from({ length: 5 - (escapedString.length % 4) }).join('=');
    return escapedString.replace(/-/g, '+').replace(/_/g, '/');
}

function decodeJWT(idToken: string) {
    const token = idToken.split('.');
    if (token.length !== 3) throw new Error('Invalid idToken');
    try {
        const headerSegment = JSON.parse(Buffer.from(token[0], 'base64').toString('utf8'));
        const payloadSegment = JSON.parse(Buffer.from(token[1], 'base64').toString('utf8'));
        const signature = unescapedString(token[2]);
        return {
            dataToSign: [token[0], token[1]].join('.'),
            header: headerSegment,
            payload: payloadSegment,
            signature,
        };
    } catch (e) {
        throw new Error('Invalid payload');
    }
}

export default class GoogleOAuthService extends Service {
    static inject = ['oauth'];
    static Config = Schema.object({
        id: Schema.string().description('Google OAuth AppID').required(),
        secret: Schema.string().description('Google OAuth Secret').role('secret').required(),
        proxy: Schema.string().description('Google OAuth Proxy').role('proxy'),
        canRegister: Schema.boolean().default(true),
    });

    constructor(ctx: Context, config: ReturnType<typeof GoogleOAuthService.Config>) {
        super(ctx, 'oauth.google');
        ctx.oauth.provide('google', {
            text: 'Login with Google',
            name: 'Google',
            canRegister: config.canRegister,
            callback: async function callback(this: Handler, {
                state, code, error,
            }) {
                if (error) throw new UserFacingError(error);
                const [url, s] = await Promise.all([
                    SystemModel.get('server.url'),
                    TokenModel.get(state, TokenModel.TYPE_OAUTH),
                ]);
                const res = await superagent.post('https://oauth2.googleapis.com/token')
                    .send({
                        client_id: config.id,
                        client_secret: config.secret,
                        code,
                        grant_type: 'authorization_code',
                        redirect_uri: `${url}oauth/google/callback`,
                    });
                const payload = decodeJWT(res.body.id_token).payload;
                await TokenModel.del(state, TokenModel.TYPE_OAUTH);
                this.response.redirect = s.redirect;
                return {
                    _id: payload.sub.toString(),
                    email: payload.email,
                    uname: [`${payload.given_name} ${payload.family_name}`, payload.name],
                    viewLang: payload.locale.replace('-', '_'),
                };
            },
            get: async function get(this: Handler) {
                const [state] = await TokenModel.add(TokenModel.TYPE_OAUTH, 600, { redirect: this.request.referer });
                const url = SystemModel.get('server.url');
                const scope = encodeURIComponent('https://www.googleapis.com/auth/userinfo.email https://www.googleapis.com/auth/userinfo.profile');
                // eslint-disable-next-line max-len
                this.response.redirect = `https://accounts.google.com/o/oauth2/v2/auth?client_id=${config.id}&response_type=code&redirect_uri=${url}oauth/google/callback&scope=${scope}&state=${state}`;
            },
        });
        ctx.i18n.load('zh', {
            'Login With Google': '使用 Google 登录',
        });
    }
}
