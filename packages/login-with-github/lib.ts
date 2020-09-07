import 'hydrooj';
import * as superagent from 'superagent';
import superagentProxy from 'superagent-proxy';

superagentProxy(superagent);

declare module 'hydrooj' {
    interface SystemKeys {
        'login-with-github.id': string,
        'login-with-github.secret': string,
        'login-with-github.proxy': string,
    }
}

async function get() {
    const { system, token } = global.Hydro.model;
    const [appid, [state]] = await Promise.all([
        system.get('login-with-github.id'),
        token.add(token.TYPE_OAUTH, 600, { redirect: this.request.referer }),
    ]);
    this.response.redirect = `https://github.com/login/oauth/authorize?client_id=${appid}&state=${state}`;
}

async function callback({ state, code }) {
    const { system, token } = global.Hydro.model;
    const { UserFacingError } = global.Hydro.error;
    const [[appid, secret, proxy, url], s] = await Promise.all([
        system.getMany([
            'login-with-github.id',
            'login-with-github.secret',
            'login-with-github.proxy',
            'server.url',
        ]),
        token.get(state, token.TYPE_OAUTH),
    ]);
    const res = await superagent.post('https://github.com/login/oauth/access_token')
        .proxy(proxy)
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
    const userInfo = await superagent.get('https://api.github.com/user')
        .proxy(proxy)
        .set('User-Agent', 'Hydro-OAuth')
        .set('Authorization', `token ${t}`);
    const ret = {
        _id: `${userInfo.body.id}@github.local`,
        email: userInfo.body.email,
        bio: userInfo.body.bio,
        uname: [userInfo.body.name, userInfo.body.login],
    };
    this.response.redirect = s.redirect;
    await token.del(s._id, token.TYPE_OAUTH);
    return ret;
}

global.Hydro.lib.oauth_github = {
    text: 'Login with Github',
    callback,
    get,
};
