import {
    Context, Handler, superagent, SystemModel, TokenModel, UserFacingError,
} from 'hydrooj';

import crypto from 'crypto';

declare module 'hydrooj' {
    interface SystemKeys {
        'login-with-wechat.appid': string,
        'login-with-wechat.appsecret': string,
    }
}

async function get(this: Handler) {
    const [appid, appsecret, url, [state]] = await Promise.all([
        SystemModel.get('login-with-wechat.appid'),
        SystemModel.get('login-with-wechat.appsecret'),
        SystemModel.get('server.url'),
        TokenModel.add(TokenModel.TYPE_OAUTH, 600, { redirect: this.request.referer }),
    ]);

    // 通过appid，appsecret 生成 accessToken
    const accessTokenUrl = "https://api.weixin.qq.com/cgi-bin/token?grant_type=client_credential&appid="+appid+"&secret="+appsecret;
    
    // 从数据库读取accessToken和expiretime，看是否为空或者超时，重新请求
    let accessToken = "";
    accessToken = await superagent.get(accessTokenUrl);
    //save accessToken 和 expire time



    // 生成二维码；
    // https://api.weixin.qq.com/cgi-bin/qrcode/create?access_token=
    const qrcodeGenerateUrl = "https://api.weixin.qq.com/cgi-bin/qrcode/create?access_token="+accessToken;
    //String jsonData = "{\"expire_seconds\": 600, \"action_name\": \"QR_STR_SCENE\", \"action_info\": {\"scene\": {\"scene_str\": \"login\"}}}";

    const qrcodeData = await superagent.get(qrcodeGenerateUrl).send({
        expire_seconds: 600,
        action_name: "QR_STR_SCENE",
        action_info: {
            scene: {
                scene_str: "login"
            }
        }
    })
    const ticket = qrcodeData['ticket'];
    // 显示二维码图片 
    const qrcodeUrl ="https://mp.weixin.qq.com/cgi-bin/showqrcode?ticket="+ticket;

    // ui show qrcode

    // eslint-disable-next-line max-len
    //this.response.redirect = `https://accounts.google.com/o/oauth2/v2/auth?client_id=${appid}&response_type=code&redirect_uri=${url}oauth/google/callback&scope=https://www.googleapis.com/auth/userinfo.email https://www.googleapis.com/auth/userinfo.profile&state=${state}`;
}

function unescapedString(escapedString: string) {
    escapedString += new Array(5 - (escapedString.length % 4)).join('=');
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

async function callback(this: Handler, {
    state, code, error,
}) {
    if (error) throw new UserFacingError(error);
    const [[appid, secret, url], s] = await Promise.all([
        SystemModel.getMany([
            'login-with-wechat.appid', 'login-with-wechat.appsecret', 'server.url',
        ]),
        TokenModel.get(state, TokenModel.TYPE_OAUTH),
    ]);
    const res = await superagent.post('https://oauth2.googleapis.com/token')
        .send({
            client_id: appid,
            client_secret: secret,
            code,
            grant_type: 'authorization_code',
            redirect_uri: `${url}oauth/google/callback`,
        });
    const payload = decodeJWT(res.body.id_token).payload;
    await TokenModel.del(state, TokenModel.TYPE_OAUTH);
    this.response.redirect = s.redirect;
    return {
        // TODO use openid
        _id: payload.email,
        email: payload.email,
        uname: [payload.given_name, payload.name, payload.family_name],
        viewLang: payload.locale.replace('-', '_'),
    };
}

function sha1(data) {
    return crypto.createHash('sha1').update(data).digest('hex');
}

//https://blog.csdn.net/shenZi_bachong/article/details/136481829
class WechatcheckHandler extends Handler {
    async get(signature: string, timestamp: string, nonce: string, echostr: string) {
        const [token] = await Promise.all([
            SystemModel.get('login-with-wechat.checkToken'),
        ]);

        let raws = [token, timestamp, nonce];
        raws.sort();
        let rawtext = "";
        raws.forEach(e =>{
            rawtext += e;
        })
        //MessageDigest.getInstance("SHA-1"); 
        let hexRawtext = crypto.createHash('sha1').update(rawtext).digest('hex');
        
        // 产生16进制串， 与 signature比较
        if (hexRawtext === signature) {
            this.response.body = echostr;
        } else {
            this.response.body = "error";
        }

    }

}

export function apply(ctx: Context) {
    ctx.Route("wx", "/wechat/check", WechatcheckHandler);
    ctx.provideModule('oauth', 'wechat', {
        text: 'Login with Wechat',
        //icon: 微信图标
        callback,
        get,
    });
    ctx.i18n.load('zh', {
        'Login With Wechat': '微信登录',
    });
}
