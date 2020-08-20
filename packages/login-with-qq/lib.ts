import 'hydrooj';
import 'hydrooj/dist/utils';

async function get() {
    const { system, token } = global.Hydro.model;
    const secret = String.random(8);
    const [id, [tokenId]] = await Promise.all([
        system.get('login-with-qq.id'),
        token.add(token.TYPE_OAUTH, 600, { redirect: this.request.referer, secret }),
    ]);
    const message = `Please send "login ${secret}" to qq account ${id}, and then use the link below:\n /oauth/qq/callback?state=${tokenId}`;
    this.response.body = {
        code: tokenId, secret, id, message,
    };
}

async function callback({ state }) {
    const { token } = global.Hydro.model;
    const { InvalidTokenError } = global.Hydro.error;
    const s = await token.get(state, token.TYPE_OAUTH);
    if (!s || !s.email) throw new InvalidTokenError(state);
    const ret = {
        _id: s.email,
        email: s.email,
        bio: '',
        uname: [s.username],
    };
    this.response.redirect = s.redirect;
    await token.del(s._id, token.TYPE_OAUTH);
    return ret;
}

global.Hydro.lib.oauth_qq = {
    text: 'Login with QQ',
    callback,
    get,
};
