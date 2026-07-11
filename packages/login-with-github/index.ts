import {
    Context, ForbiddenError, Handler, Schema, Service, superagent, SystemModel,
    TokenModel, UserFacingError, ValidationError,
} from 'hydrooj';

// from https://github.com/logos
// eslint-disable-next-line max-len
const icon = '<svg viewBox="0 0 98 96" xmlns="http://www.w3.org/2000/svg"><path fill-rule="evenodd" clip-rule="evenodd" d="M48.854 0C21.839 0 0 22 0 49.217c0 21.756 13.993 40.172 33.405 46.69 2.427.49 3.316-1.059 3.316-2.362 0-1.141-.08-5.052-.08-9.127-13.59 2.934-16.42-5.867-16.42-5.867-2.184-5.704-5.42-7.17-5.42-7.17-4.448-3.015.324-3.015.324-3.015 4.934.326 7.523 5.052 7.523 5.052 4.367 7.496 11.404 5.378 14.235 4.074.404-3.178 1.699-5.378 3.074-6.6-10.839-1.141-22.243-5.378-22.243-24.283 0-5.378 1.94-9.778 5.014-13.2-.485-1.222-2.184-6.275.486-13.038 0 0 4.125-1.304 13.426 5.052a46.97 46.97 0 0 1 12.214-1.63c4.125 0 8.33.571 12.213 1.63 9.302-6.356 13.427-5.052 13.427-5.052 2.67 6.763.97 11.816.485 13.038 3.155 3.422 5.015 7.822 5.015 13.2 0 18.905-11.404 23.06-22.324 24.283 1.78 1.548 3.316 4.481 3.316 9.126 0 6.6-.08 11.897-.08 13.526 0 1.304.89 2.853 3.316 2.364 19.412-6.52 33.405-24.935 33.405-46.691C97.707 22 75.788 0 48.854 0z" /></svg>';

export default class LoginWithGithubService extends Service {
    static inject = ['oauth'];
    static Config = Schema.object({
        id: Schema.string().description('GitHub OAuth AppID').required(),
        secret: Schema.string().description('GitHub OAuth Secret').role('secret').required(),
        endpoint: Schema.string().description('GitHub Endpoint'),
        canRegister: Schema.boolean().default(true),
    });

    constructor(ctx: Context, config: ReturnType<typeof LoginWithGithubService.Config>) {
        super(ctx, 'oauth.github');
        ctx.oauth.provide('github', {
            text: 'Login with GitHub',
            name: 'GitHub',
            icon,
            canRegister: config.canRegister,
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
                    _id: userInfo.body.id.toString(),
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
            'Login With GitHub': '使用 GitHub 登录',
        });
    }
}
