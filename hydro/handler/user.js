const superagent = require('superagent');
const { Route, Handler } = require('../service/server.js');
const user = require('../model/user');
const token = require('../model/token');
const system = require('../model/system');
const { sendMail } = require('../lib/mail');
const misc = require('../lib/misc');
const {
    UserAlreadyExistError, InvalidTokenError, VerifyPasswordError,
    UserNotFoundError, LoginError, SystemError,
    PermissionError, BlacklistedError, UserFacingError,
} = require('../error');

class UserLoginHandler extends Handler {
    async get() {
        const [loginWithGithub, loginWithGoogle] = await system.getMany(
            ['oauth.githubappid', 'oauth.googleappid'],
        );
        this.response.body = {
            loginWithGithub, loginWithGoogle,
        };
        this.response.template = 'user_login.html';
    }

    async post({
        domainId, uname, password, rememberme = false,
    }) {
        const udoc = await user.getByUname(domainId, uname);
        if (!udoc) throw new LoginError(uname);
        if (udoc) udoc.checkPassword(password);
        await user.setById(udoc._id, { loginat: new Date(), loginip: this.request.ip });
        if (udoc.ban) throw new BlacklistedError(uname);
        this.session.uid = udoc._id;
        this.session.rememberme = rememberme;
        this.response.redirect = this.request.referer.endsWith('/login') ? '/' : this.request.referer;
    }
}

class UserLogoutHandler extends Handler {
    async get() {
        this.response.template = 'user_logout.html';
    }

    async post() {
        this.session.uid = 1;
    }
}

class UserRegisterHandler extends Handler {
    async prepare() { // eslint-disable-line class-methods-use-this
        if (!await system.get('user.register')) {
            throw new PermissionError('Register');
        }
    }

    async get() {
        this.response.template = 'user_register.html';
    }

    async post({ mail }) {
        if (await user.getByEmail('system', mail, true)) throw new UserAlreadyExistError(mail);
        this.limitRate('send_mail', 3600, 30);
        const t = await token.add(
            token.TYPE_REGISTRATION,
            await system.get('registration_token_expire_seconds'),
            { mail },
        );
        if (await system.get('smtp.user')) {
            const m = await this.renderHTML('user_register_mail.html', {
                path: `register/${t[0]}`,
                url_prefix: await system.get('server.url'),
            });
            await sendMail(mail, 'Sign Up', 'user_register_mail', m);
            this.response.template = 'user_register_mail_sent.html';
        } else {
            this.response.redirect = `/register/${t[0]}`;
        }
    }
}

class UserRegisterWithCodeHandler extends Handler {
    async get({ code }) {
        this.response.template = 'user_register_with_code.html';
        const { mail } = await token.get(code, token.TYPE_REGISTRATION);
        if (!mail) throw new InvalidTokenError(token.TYPE_REGISTRATION, code);
        this.response.body = { mail };
    }

    async post({
        code, password, verifyPassword, uname,
    }) {
        const { mail } = await token.get(code, token.TYPE_REGISTRATION);
        if (!mail) throw new InvalidTokenError(token.TYPE_REGISTRATION, code);
        if (password !== verifyPassword) throw new VerifyPasswordError();
        const uid = await system.inc('user');
        await user.create({
            uid, uname, password, mail, regip: this.request.ip,
        });
        await token.del(code, token.TYPE_REGISTRATION);
        this.session.uid = uid;
        this.response.redirect = '/';
    }
}

class UserLostPassHandler extends Handler {
    async get() {
        if (!await system.get('smtp.user')) throw new SystemError('Cannot send mail');
        this.response.template = 'user_lostpass.html';
    }

    async post({ mail }) {
        if (!await system.get('smtp.user')) throw new SystemError('Cannot send mail');
        const udoc = await user.getByEmail(mail);
        if (!udoc) throw new UserNotFoundError(mail);
        const tid = await token.add(
            token.TYPE_LOSTPASS,
            await system.get('lostpass_token_expire_seconds'),
            { uid: udoc._id },
        );
        const m = await this.renderHTML('user_lostpass_mail', { url: `/lostpass/${tid}`, uname: udoc.uname });
        await sendMail(mail, 'Lost Password', 'user_lostpass_mail', m);
        this.response.template = 'user_lostpass_mail_sent.html';
    }
}

class UserLostPassWithCodeHandler extends Handler {
    async get({ domainId, code }) {
        const tdoc = await token.get(code, token.TYPE_LOSTPASS);
        if (!tdoc) throw new InvalidTokenError(token.TYPE_LOSTPASS, code);
        const udoc = await user.getById(domainId, tdoc.uid);
        this.response.body = { uname: udoc.uname };
    }

    async post({ code, password, verifyPassword }) {
        const tdoc = await token.get(code, token.TYPE_LOSTPASS);
        if (!tdoc) throw new InvalidTokenError(token.TYPE_LOSTPASS, code);
        if (password !== verifyPassword) throw new VerifyPasswordError();
        await user.setPassword(tdoc.uid, password);
        await token.del(code, token.TYPE_LOSTPASS);
        this.response.redirect = '/';
    }
}

class UserDetailHandler extends Handler {
    async get({ domainId, uid }) {
        const isSelfProfile = this.user._id === uid;
        const udoc = await user.getById(domainId, uid, true);
        const sdoc = await token.getMostRecentSessionByUid(uid);
        this.response.template = 'user_detail.html';
        this.response.body = { isSelfProfile, udoc, sdoc };
    }
}

class UserSearchHandler extends Handler {
    async get({ domainId, q, exactMatch = false }) {
        let udocs;
        if (exactMatch) udocs = [];
        else udocs = await user.getPrefixList(q, 20);
        const udoc = await user.getById(domainId, parseInt(q, 10));
        if (udoc) udocs.push(udoc);
        for (const i in udocs) {
            if (udocs[i].gravatar) {
                udocs[i].gravatar_url = misc.gravatar(udocs[i].gravatar);
            }
        }
        this.response.body = udocs;
    }
}

class OauthHandler extends Handler {
    async github() {
        const [appid, [state]] = await Promise.all([
            system.get('oauth.githubappid'),
            token.add(token.TYPE_OAUTH, 600, { redirect: this.request.referer }),
        ]);
        this.response.redirect = `https://github.com/login/oauth/authorize?client_id=${appid}&state=${state}`;
    }

    async google() {
        const [appid, url, [state]] = await Promise.all([
            system.get('oauth.googleappid'),
            system.get('server.url'),
            token.add(token.TYPE_OAUTH, 600, { redirect: this.request.referer }),
        ]);
        this.response.redirect = `https://accounts.google.com/o/oauth2/v2/auth?client_id=${appid}&response_type=code&redirect_uri=${url}oauth/google/callback&scope=https://www.googleapis.com/auth/userinfo.email https://www.googleapis.com/auth/userinfo.profile&state=${state}`;
    }

    async get({ type }) {
        if (type === 'github') await this.github();
        else if (type === 'google') await this.google();
    }
}

class OauthCallbackHandler extends Handler {
    async github({ state, code }) {
        const [appid, secret, url, proxy, s] = await Promise.all([
            system.get('oauth.githubappid'),
            system.get('oauth.githubsecret'),
            system.get('server.url'),
            system.get('proxy'),
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
            email: userInfo.body.email,
            bio: userInfo.body.bio,
            uname: [userInfo.body.name, userInfo.body.login],
        };
        this.response.redirect = s.redirect;
        await token.del(s, token.TYPE_OAUTH);
        return ret;
    }

    async google({
        code, scope, authuser, prompt, error, state,
    }) {
        if (error) throw new UserFacingError(error);
        console.log(scope, authuser, prompt);
        const [
            [appid, secret, url, proxy],
            s,
        ] = await Promise.all([
            system.getMany([
                'oauth.googleappid', 'oauth.googlesecret', 'server.url', 'proxy',
            ]),
            token.get(state, token.TYPE_OAUTH),
        ]);
        const res = await superagent.post('https://oauth2.googleapis.com/token')
            .proxy(proxy)
            .send({
                client_id: appid,
                client_secret: secret,
                code,
                grant_type: 'authorization_code',
                redirect_uri: `${url}oauth/google/callback`,
            });
        const payload = global.Hydro.lib.jwt.decode(res.body.id_token);
        await token.del(state, token.TYPE_OAUTH);
        this.response.redirect = s.redirect;
        return {
            email: payload.email,
            uname: [payload.given_name, payload.name, payload.family_name],
            viewLang: payload.locale.replace('-', '_'),
        };
    }

    async get(args) {
        let r;
        if (args.type === 'github') r = await this.github(args);
        else if (args.type === 'google') r = await this.google(args);
        else throw new UserFacingError('Oauth type');
        const udoc = await user.getByEmail('system', r.email, true);
        if (udoc) {
            this.session.uid = udoc._id;
        } else {
            let username = '';
            r.uname = r.uname || [];
            r.uname.push(String.random(16));
            for (const uname of r.uname) {
                // eslint-disable-next-line no-await-in-loop
                const nudoc = await user.getByUname('system', uname, true);
                if (!nudoc) {
                    username = uname;
                    break;
                }
            }
            const uid = await user.create({
                mail: r.email, uname: username, password: String.random(32), regip: this.request.ip,
            });
            const $set = {
                oauth: args.type,
            };
            if (r.bio) $set.bio = r.bio;
            if (r.viewLang) $set.viewLang = r.viewLang;
            await user.setById(uid, $set);
            this.session.uid = uid;
        }
    }
}

async function apply() {
    Route('user_login', '/login', UserLoginHandler);
    Route('user_oauth', '/oauth/:type', OauthHandler);
    Route('user_oauth_callback', '/oauth/:type/callback', OauthCallbackHandler);
    Route('user_register', '/register', UserRegisterHandler);
    Route('user_register_with_code', '/register/:code', UserRegisterWithCodeHandler);
    Route('user_logout', '/logout', UserLogoutHandler);
    Route('user_lostpass', '/lostpass', UserLostPassHandler);
    Route('user_lostpass_with_code', '/lostpass/:code', UserLostPassWithCodeHandler);
    Route('user_search', '/user/search', UserSearchHandler);
    Route('user_detail', '/user/:uid', UserDetailHandler);
}

global.Hydro.handler.user = module.exports = apply;
