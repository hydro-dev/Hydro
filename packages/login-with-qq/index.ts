// Power by air. <air@adteam.cc>
import {
    Context, Handler, superagent, SystemModel, TokenModel, OauthModel,
} from 'hydrooj';

const { PRIV } = global.Hydro.model.builtin; // 内置 Privilege 权限节点

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

async function callback(this: Handler, { state, code }) {
    const [[appid, secret, url], s] = await Promise.all([
        SystemModel.getMany([
            'login-qq.id', 'login-qq.secret', 'server.url',
        ]),
        TokenModel.get(state, TokenModel.TYPE_OAUTH),
    ]);
    const res = await superagent.get(`https://graph.qq.com/oauth2.0/token`)
        .set('accept', 'application/json')
        .query({
            grant_type: `authorization_code`,
            client_id: appid,
            client_secret: secret,
            code,
            redirect_uri: `${url}oauth/qq/callback`,
            fmt: `json`,
        })
        .send();
    const receiveData = res.text;
    const tokenJson = JSON.parse(receiveData);
    const t = tokenJson.access_token;
    const userInfo = await superagent.get(`https://graph.qq.com/oauth2.0/me`)
            .query({
                fmt: 'json',
                access_token: t,
            })
            .send();
    const receiveUserData = userInfo.text;
    const userJson = JSON.parse(receiveUserData);
    const OpenID = userJson.openid;
    if (this.user.hasPriv(PRIV.PRIV_USER_PROFILE)) {
        OauthModel.set(OpenID, this.user._id);
    }
    await TokenModel.del(state, TokenModel.TYPE_OAUTH);
    this.response.redirect = s.redirect;
    return {
        _id: OpenID,
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
        'jump of qq connect': '自动跳转到主页表示绑定成功。未绑定的QQ会重定向到主页，但无法登录。',
        'binding': 'QQ 绑定',
        'bind_and_binding': 'QQ 绑定与重绑定',
    });
    ctx.i18n.load('en', {
        'Login with QQ': 'Login with QQ',
        'jump of qq connect': 'Automatically jump to the homepage to indicate successful binding. Unbound QQ will redirect to the homepage, but cannot log in.',
        'binding': 'QQ binding',
        'bind_and_binding': 'QQ binding and rebinding',
    });
}