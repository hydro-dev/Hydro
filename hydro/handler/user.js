const { Route, Handler } = require('../service/server.js');
const user = require('../model/user');
const token = require('../model/token');
const system = require('../model/system');
const { sendMail } = require('../lib/mail');
const misc = require('../lib/misc');
const { PERM_LOGGEDIN } = require('../permission');
const {
    UserAlreadyExistError, InvalidTokenError, VerifyPasswordError,
    UserNotFoundError, LoginError, SystemError,
    PermissionError, BlacklistedError,
} = require('../error');

class UserLoginHandler extends Handler {
    async get() {
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
        const referer = this.request.headers.referer || '/';
        this.response.redirect = referer.endsWith('/login') ? '/' : referer;
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
                url: `${await system.get('server.url')}/register/${t[0]}`,
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
        await token.delete(code, token.TYPE_REGISTRATION);
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
        await token.delete(code, token.TYPE_LOSTPASS);
        this.response.redirect = '/';
    }
}

class UserDetailHandler extends Handler {
    async get({ domainId, uid }) {
        const isSelfProfile = this.user._id === uid;
        const udoc = await user.getById(domainId, uid);
        if (!udoc) throw new UserNotFoundError(uid);
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
        try {
            const udoc = await user.getById(domainId, parseInt(q));
            if (udoc) udocs.push(udoc);
        } catch (e) {
            /* Ignore */
        }
        for (const i in udocs) {
            if (udocs[i].gravatar) {
                udocs[i].gravatar_url = misc.gravatar(udocs[i].gravatar);
            }
        }
        this.response.body = udocs;
    }
}

async function apply() {
    Route('/login', UserLoginHandler);
    Route('/register', UserRegisterHandler);
    Route('/register/:code', UserRegisterWithCodeHandler);
    Route('/logout', UserLogoutHandler, PERM_LOGGEDIN);
    Route('/lostpass', UserLostPassHandler);
    Route('/lostpass/:code', UserLostPassWithCodeHandler);
    Route('/user/search', UserSearchHandler);
    Route('/user/:uid', UserDetailHandler);
}

global.Hydro.handler.user = module.exports = apply;
