import {
    Context, ForbiddenError, Handler, Schema, Service, superagent, SystemModel,
    TokenModel, UserFacingError, ValidationError,
} from 'hydrooj';

export default class LoginWithGithubService extends Service {
    static Config = Schema.object({
        id: Schema.string().description('Github OAuth AppID').required(),
        secret: Schema.string().description('Github OAuth Secret').role('secret').required(),
        endpoint: Schema.string().description('Github Endpoint'),
    });

    constructor(ctx: Context, config: ReturnType<typeof LoginWithGithubService.Config>) {
        super(ctx, 'oauth.github');
        ctx.provideModule('oauth', 'github', {
            text: 'Login with Github',
            callback: async function callback({ state, code }) {
                const s = await TokenModel.get(state, TokenModel.TYPE_OAUTH);
                if (!s) throw new ValidationError('token');
                const url = SystemModel.get('server.url');
                const res = await superagent.post(`${config.endpoint || 'https://github.com'}/login/oauth/access_token`)
                    .send({
                        client_id: config.id,
                        client_secret: config.secret,
                        code,
                        redirect_uri: `${url}oauth/github/callback`,
                        state,
                    })
                    .set('accept', 'application/json');
                if (res.body.error) {
                    throw new UserFacingError(
                        res.body.error, res.body.error_description, res.body.error_uri,
                    );
                }
                const t = res.body.access_token;
                const userInfo = await superagent.get(`${config.endpoint ? `${config.endpoint}/api` : 'https://api.github.com'}/user`)
                    .set('User-Agent', 'Hydro-OAuth')
                    .set('Accept', 'application/vnd.github.v3+json')
                    .set('Authorization', `token ${t}`);
                const ret = {
                    _id: `${userInfo.body.id}@github.local`,
                    email: userInfo.body.email,
                    bio: userInfo.body.bio,
                    uname: [userInfo.body.name, userInfo.body.login].filter((i) => i),
                    avatar: `github:${userInfo.body.login}`,
                };
                if (!ret.email) {
                    const emailInfo = await superagent.get(`${config.endpoint ? `${config.endpoint}/api` : 'https://api.github.com'}/user/emails`)
                        .set('User-Agent', 'Hydro-OAuth')
                        .set('Accept', 'application/vnd.github.v3+json')
                        .set('Authorization', `token ${t}`);
                    if (emailInfo.body.length) {
                        ret.email = emailInfo.body.find((e) => e.primary && e.verified).email;
                    }
                }
                await TokenModel.del(s._id, TokenModel.TYPE_OAUTH);
                if (!ret.email) throw new ForbiddenError("You don't have a verified email.");
                return ret;
            },
            get: async function get(this: Handler) {
                const [state] = await TokenModel.add(TokenModel.TYPE_OAUTH, 600, { redirect: this.request.referer });
                this.response.redirect = `https://github.com/login/oauth/authorize?client_id=${config.id}&state=${state}&scope=read:user,user:email`;
            },
        });
        ctx.i18n.load('zh', {
            'Login With Github': '使用 Github 登录',
        });
    }
}
