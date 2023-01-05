import {
    Context, ForbiddenError, Handler, superagent, SystemModel,
    TokenModel, UserFacingError, ValidationError,
} from 'hydrooj';

declare module 'hydrooj' {
    interface SystemKeys {
        'login-with-github.id': string;
        'login-with-github.secret': string;
        'login-with-github.endpoint': string;
    }
}

async function get(this: Handler) {
    const [appid, [state]] = await Promise.all([
        SystemModel.get('login-with-github.id'),
        TokenModel.add(TokenModel.TYPE_OAUTH, 600, { redirect: this.request.referer }),
    ]);
    this.response.redirect = `https://github.com/login/oauth/authorize?client_id=${appid}&state=${state}&scope=read:user,user:email`;
}

async function callback({ state, code }) {
    const [[appid, secret, endpoint, url], s] = await Promise.all([
        SystemModel.getMany([
            'login-with-github.id',
            'login-with-github.secret',
            'login-with-github.endpoint',
            'server.url',
        ]),
        TokenModel.get(state, TokenModel.TYPE_OAUTH),
    ]);
    if (!s) throw new ValidationError('token');
    const res = await superagent.post(`${endpoint || 'https://github.com'}/login/oauth/access_token`)
        .send({
            client_id: appid,
            client_secret: secret,
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
    const userInfo = await superagent.get(`${endpoint ? `${endpoint}/api` : 'https://api.github.com'}/user`)
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
        const emailInfo = await superagent.get(`${endpoint ? `${endpoint}/api` : 'https://api.github.com'}/user/emails`)
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
}

export function apply(ctx: Context) {
    ctx.provideModule('oauth', 'github', {
        text: 'Login with Github',
        callback,
        get,
    });
    ctx.i18n.load('zh', {
        'Login With Github': '使用 Github 登录',
    });
}
