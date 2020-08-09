import 'hydrooj';
import * as superagent from 'superagent';
import superagentProxy from 'superagent-proxy';

superagentProxy(superagent);

async function get() {
    const { system, token } = global.Hydro.model;
    const [[appid, url], [state]] = await Promise.all([
        system.getMany([
            'login-with-osu.id',
            'server.url',
        ]),
        token.add(token.TYPE_OAUTH, 600, { redirect: this.request.referer }),
    ]);
    this.response.redirect = `https://osu.ppy.sh/oauth/authorize?client_id=${appid}&state=${state}&redirect_uri=${url}oauth/osu/callback&response_type=code`;
}

async function callback({ state, code }) {
    const { system, token } = global.Hydro.model;
    const { UserFacingError } = global.Hydro.error;
    const [[appid, secret, proxy, url], s] = await Promise.all([
        system.getMany([
            'login-with-osu.id',
            'login-with-osu.secret',
            'login-with-osu.proxy',
            'server.url',
        ]),
        token.get(state, token.TYPE_OAUTH),
    ]);
    const res = await superagent.post('https://osu.ppy.sh/oauth/token')
        .proxy(proxy)
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
    const userInfo = await superagent.get('https://osu.ppy.sh/api/v2/me')
        .proxy(proxy)
        .set('User-Agent', 'Hydro-OAuth')
        .set('Authorization', `Bearer ${t}`);
    const ret = {
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
