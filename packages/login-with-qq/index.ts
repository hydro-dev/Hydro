/**
*****************************************************************************
*
*  @file    index.ts
*  @brief   绑定/登录主入口文件和回调函数
*
*  @author  air
*  @date    2023/8/31
*  @version 1.0.0
*
*****************************************************************************
*/

import {
    Context, ForbiddenError, Handler, superagent, SystemModel,
    TokenModel, UserFacingError, ValidationError, OauthModel, OauthCallbackHandler
} from 'hydrooj';

import { Notification } from '@hydrooj/ui-default';

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

function unescapedString(escapedString: string) {
    escapedString += new Array(5 - (escapedString.length % 4)).join('=');
    return escapedString.replace(/-/g, '+').replace(/_/g, '/');
}

async function callback(this: Handler, { state, code}) {
    const [[appid, secret, url], s] = await Promise.all([
        SystemModel.getMany([
            'login-qq.id', 'login-qq.secret', 'server.url',
        ]),
        TokenModel.get(state, TokenModel.TYPE_OAUTH),
    ]);
    const res = await superagent.get(`https://graph.qq.com/oauth2.0/token?grant_type=authorization_code&client_id=${appid}&client_secret=${secret}&code=${code}&redirect_uri=${url}oauth/qq/callback&fmt=json`)
        .set('User-Agent', 'ADTeam-OAuth')
        .set('accept', 'application/json')
        .send();
    
    const fanhui = res.text;
    const JSobj_token = JSON.parse(fanhui);
    const t = JSobj_token.access_token;
    const userInfo = await superagent.get(`https://graph.qq.com/oauth2.0/me?fmt=json&access_token=${t}`)
            .send();

    const fanhui_id = userInfo.text;
    const JSobj_id = JSON.parse(fanhui_id);
    
    const OpenID = JSobj_id.openid;
    
    if(this.user.hasPriv(PRIV.PRIV_USER_PROFILE)){
        OauthModel.set(OpenID, this.user._id);
    }
    await TokenModel.del(state, TokenModel.TYPE_OAUTH);
    this.response.redirect = s.redirect;
    console.log();
    return {
        //TODO use openid
        _id: OpenID
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
    });
}