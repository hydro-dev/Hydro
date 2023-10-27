import {
    Context, Handler, superagent, SystemModel, TokenModel, ValidationError,
} from 'hydrooj';

declare module 'hydrooj' {
    interface SystemKeys {
        'login-qq.id': string,
        'login-qq.secret': string,
    }
}

async function get(this: Handler) {
    const [appid, url, [state]] = await Promise.all([
        SystemModel.get('login-qq.id'),
        SystemModel.get('server.url'),
        TokenModel.add(TokenModel.TYPE_OAUTH, 600, { redirect: this.request.referer }),
    ]);
    // eslint-disable-next-line max-len
    this.response.redirect = `https://graph.qq.com/oauth2.0/authorize?response_type=code&client_id=${appid}&redirect_uri=${url}oauth/qq/callback&state=${state}`;
}

async function callback({ state, code }) {
    const [[appid, secret, url], s] = await Promise.all([
        SystemModel.getMany([
            'login-qq.id', 'login-qq.secret', 'server.url',
        ]),
        TokenModel.get(state, TokenModel.TYPE_OAUTH),
    ]);
    if (!s) throw new ValidationError('token');
    const resToken = await superagent.get('https://graph.qq.com/oauth2.0/token')
        .set('accept', 'application/json')
        .query({
            grant_type: 'authorization_code',
            client_id: appid,
            client_secret: secret,
            code,
            redirect_uri: `${url}oauth/qq/callback`,
            fmt: 'json',
        }).send();
    const t = resToken.body.access_token;
    const resUser = await superagent.get('https://graph.qq.com/oauth2.0/me')
        .query({
            fmt: 'json',
            access_token: t,
        }).send();
    const userInfo = await superagent.get('https://graph.qq.com/user/get_user_info')
        .query({
            fmt: 'json',
            access_token: t,
            oauth_consumer_key: appid,
            openid: resUser.body.openid,
        }).send();
    await TokenModel.del(s._id, TokenModel.TYPE_OAUTH);
    return {
        _id: `${resUser.body.openid}@oauth.qq.local`,
        email: `${resUser.body.openid}@oauth.qq.local`,
        uname: [userInfo.body.nickname],
        avatar: `url:${userInfo.body.figureurl_qq_1}`,
    };
}

export function apply(ctx: Context) {
    ctx.provideModule('oauth', 'qq', {
        text: 'Login with QQ',
        callback,
        get,
    });
    ctx.i18n.load('zh', {
        'Login with QQ': '使用 QQ 登录',
        'Binding with QQ': '绑定 QQ',
    });
}
