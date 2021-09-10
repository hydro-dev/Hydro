import 'hydrooj';

import * as superagent from 'superagent';

declare module 'hydrooj' {
    interface SystemKeys {
        'login-with-osu.id': string,
        'login-with-osu.secret': string,
    }
    interface Lib {
        oauth_osu: typeof import('./lib'),
    }
}

const BASE_URL = 'https://osu.ppy.sh/';

async function get() {
    const { system, token } = global.Hydro.model;
    const [[appid, url], [state]] = await Promise.all([
        system.getMany([
            'login-with-osu.id',
            'server.url',
        ]),
        token.add(token.TYPE_OAUTH, 600, { redirect: this.request.referer }),
    ]);
    this.response.redirect = `${BASE_URL}oauth/authorize?client_id=${appid}&state=${state}&redirect_uri=${url}oauth/osu/callback&response_type=code`;
}

async function callback({ state, code }) {
    const { system, token } = global.Hydro.model;
    const { UserFacingError } = global.Hydro.error;
    const [[appid, secret, url], s] = await Promise.all([
        system.getMany([
            'login-with-osu.id',
            'login-with-osu.secret',
            'server.url',
        ]),
        token.get(state, token.TYPE_OAUTH),
    ]);
    const res = await superagent.post(`${BASE_URL}oauth/token`)
        .send({
            client_id: appid,
            client_secret: secret,
            code,
            grant_type: 'authorization_code',
            redirect_uri: `${url}oauth/github/callback`,
        })
        .set('accept', 'application/json');
    if (res.body.error) {
        throw new UserFacingError(
            res.body.error, res.body.error_description, res.body.error_uri,
        );
    }
    const t = res.body.access_token;
    const userInfo = await superagent.get(`${BASE_URL}api/v2/me`)
        .set('User-Agent', 'Hydro-OAuth')
        .set('Authorization', `Bearer ${t}`);
    const ret = {
        _id: `${userInfo.body.id}@osu.local`,
        email: `${userInfo.body.id}@osu.local`,
        bio: '',
        uname: [userInfo.body.username],
    };
    this.response.redirect = s.redirect;
    await token.del(s._id, token.TYPE_OAUTH);
    return ret;
}

global.Hydro.lib.oauth_osu = {
    text: 'Login with Osu',
    callback,
    get,
};
