const { Route, Handler } = require('../service/server.js');
const user = require('../model/user');
const token = require('../model/token');
const system = require('../model/system');
const { sendMail } = require('../lib/mail');
const misc = require('../lib/misc');
const options = require('../options');
const { PERM_REGISTER_USER, PERM_LOGGEDIN } = require('../permission');
const {
    UserAlreadyExistError, InvalidTokenError, VerifyPasswordError,
    UserNotFoundError, LoginError, SystemError,
} = require('../error');

class UserLoginHandler extends Handler {
    async get() {
        this.response.template = 'user_login.html';
    }

    async post({ uname, password, rememberme = false }) {
        const udoc = await user.getByUname(uname);
        if (!udoc) throw new LoginError(uname);
        if (udoc) udoc.checkPassword(password);
        await user.setById(udoc._id, { loginat: new Date(), loginip: this.request.ip });
        udoc.salt = '';
        udoc.password = '';
        this.session.uid = udoc._id;
        this.session.rememberme = rememberme;
        this.response.body = {};
        const referer = this.request.headers.referer || '/';
        this.response.redirect = referer.endsWith('/login') ? '/' : referer;
    }
}

class UserLogoutHandler extends Handler {
    async prepare() {
        this.checkPerm(PERM_LOGGEDIN);
    }

    async get() {
        this.response.template = 'user_logout.html';
    }

    async post() {
        this.session = { uid: 1 };
        this.response.body = {};
    }
}

class UserRegisterHandler extends Handler {
    async prepare() {
        this.checkPerm(PERM_REGISTER_USER);
    }

    async get() {
        this.response.template = 'user_register.html';
    }

    async post({ mail }) {
        if (await user.getByEmail(mail, true)) throw new UserAlreadyExistError(mail);
        this.limitRate('send_mail', 3600, 30);
        const t = await token.add(
            token.TYPE_REGISTRATION,
            options.registration_token_expire_seconds,
            { mail },
        );
        if (options.smtp.user) {
            const m = await this.renderHTML('user_register_mail', { url: `/register/${t}` });
            await sendMail(mail, 'Sign Up', 'user_register_mail', m);
            this.response.body = {};
            this.response.template = 'user_register_mail_sent.html';
        } else {
            this.response.redirect = `/register/${t[0]}`;
        }
    }
}

class UserRegisterWithCodeHandler extends Handler {
    async prepare() {
        this.checkPerm(PERM_REGISTER_USER);
    }

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
        this.response.body = {};
        this.response.redirect = '/';
    }
}

class UserLostPassHandler extends Handler {
    constructor(ctx) {
        if (!options.smtp.user) throw new SystemError('Cannot send mail');
        super(ctx);
    }

    async get() {
        this.response.template = 'user_lostpass.html';
    }

    async post({ mail }) {
        const udoc = await user.getByEmail(mail);
        if (!udoc) throw new UserNotFoundError(mail);
        const tid = await token.add(
            token.TYPE_LOSTPASS,
            options.lostpass_token_expire_seconds,
            { uid: udoc._id },
        );
        const m = await this.renderHTML('user_lostpass_mail', { url: `/lostpass/${tid}`, uname: udoc.uname });
        await sendMail(mail, 'Lost Password', 'user_lostpass_mail', m);
        this.response.body = {};
        this.response.template = 'user_lostpass_mail_sent.html';
    }
}

class UserLostPassWithCodeHandler extends Handler {
    async get({ code }) {
        const tdoc = await token.get(code, token.TYPE_LOSTPASS);
        if (!tdoc) throw new InvalidTokenError(token.TYPE_LOSTPASS, code);
        const udoc = await user.getById(tdoc.uid);
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
    constructor(ctx) {
        super(ctx);
        this.response.template = 'user_detail.html';
    }

    async get({ uid }) {
        const isSelfProfile = this.user._id === uid;
        const udoc = await user.getById(uid);
        if (!udoc) throw new UserNotFoundError(uid);
        const sdoc = await token.getMostRecentSessionByUid(uid);
        this.response.body = { isSelfProfile, udoc, sdoc };
    }
}

class UserSearchHandler extends Handler {
    async get({ q, exactMatch = false }) {
        let udocs;
        if (exactMatch) udocs = [];
        else udocs = await user.getPrefixList(q, 20);
        try {
            const udoc = await user.getById(parseInt(q));
            if (udoc) udocs.push(udoc);
        } catch (e) {
            /* Ignore */
        }
        for (const i in udocs) {
            if (udocs[i].gravatar) {
                udocs[i].gravatar_url = misc.gravatar_url[udocs[i].gravatar];
            }
        }
        this.response.body = udocs;
    }
}

async function apply() {
    Route('/login', module.exports.UserLoginHandler);
    Route('/register', module.exports.UserRegisterHandler);
    Route('/register/:code', module.exports.UserRegisterWithCodeHandler);
    Route('/logout', module.exports.UserLogoutHandler);
    Route('/lostpass', module.exports.UserLostPassHandler);
    Route('/lostpass/:code', module.exports.UserLostPassWithCodeHandler);
    Route('/user/search', module.exports.UserSearchHandler);
    Route('/user/:uid', module.exports.UserDetailHandler);
}

global.Hydro.handler.user = module.exports = {
    UserLoginHandler,
    UserRegisterHandler,
    UserRegisterWithCodeHandler,
    UserLogoutHandler,
    UserLostPassHandler,
    UserLostPassWithCodeHandler,
    UserSearchHandler,
    UserDetailHandler,
    apply,
};
