const
    { Route, Handler } = require('../service/server.js'),
    user = require('../model/user'),
    token = require('../model/token'),
    system = require('../model/system'),
    { sendMail } = require('../lib/mail'),
    misc = require('../lib/misc'),
    validator = require('../lib/validator'),
    options = require('../options'),
    { PERM_REGISTER_USER, PERM_LOGGEDIN } = require('../permission'),
    { UserAlreadyExistError, InvalidTokenError, VerifyPasswordError,
        UserNotFoundError, LoginError, SystemError } = require('../error');

class UserLoginHandler extends Handler {
    async get() {
        this.response.template = 'user_login.html';
    }
    async post({ uname, password, rememberme = false }) {
        let udoc = await user.getByUname(uname);
        if (!udoc) throw new LoginError(uname);
        if (udoc) udoc.checkPassword(password);
        await user.setById(udoc._id, { loginat: new Date(), loginip: this.request.ip });
        udoc.salt = '';
        udoc.password = '';
        this.session.uid = udoc._id;
        this.session.rememberme = rememberme;
        this.response.body = {};
        let referer = this.request.headers.referer || '/';
        this.response.redirect = referer.endsWith('/login') ? '/' : referer;
    }
}
class UserLogoutHandler extends Handler {
    constructor(ctx) {
        super(ctx);
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
    constructor(ctx) {
        super(ctx);
        this.checkPerm(PERM_REGISTER_USER);
    }
    async get() {
        this.response.template = 'user_register.html';
    }
    async post({ mail }) {
        validator.checkEmail(mail);
        if (await user.getByEmail(mail, true)) throw new UserAlreadyExistError(mail);
        this.limitRate('send_mail', 3600, 30);
        let t = await token.add(token.TYPE_REGISTRATION, options.registration_token_expire_seconds, { mail });
        if (options.smtp.user) {
            let m = await this.renderHTML('user_register_mail', { url: `/register/${t}` });
            await sendMail(mail, 'Sign Up', 'user_register_mail', m);
            this.response.body = {};
            this.response.template = 'user_register_mail_sent.html';
        } else {
            this.response.redirect = `/register/${t[0]}`;
        }
    }
}
class UserRegisterWithCodeHandler extends Handler {
    constructor(ctx) {
        super(ctx);
        this.checkPerm(PERM_REGISTER_USER);
    }
    async get({ code }) {
        this.response.template = 'user_register_with_code.html';
        let { mail } = await token.get(code, token.TYPE_REGISTRATION);
        if (!mail) throw new InvalidTokenError(token.TYPE_REGISTRATION, code);
        this.response.body = { mail };
    }
    async post({ code, password, verify_password, uname }) {
        let { mail } = await token.get(code, token.TYPE_REGISTRATION);
        if (!mail) throw new InvalidTokenError(token.TYPE_REGISTRATION, code);
        if (password != verify_password) throw new VerifyPasswordError();
        let uid = await system.incUserCounter();
        await user.create({ uid, uname, password, mail, regip: this.request.ip });
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
        validator.checkEmail(mail);
        let udoc = await user.getByEmail(mail);
        if (!udoc) throw new UserNotFoundError(mail);
        let tid = await token.add(
            token.TYPE_LOSTPASS,
            options.lostpass_token_expire_seconds,
            { uid: udoc._id }
        );
        let m = await this.renderHTML('user_lostpass_mail', { url: `/lostpass/${tid}`, uname: udoc.uname });
        await sendMail(mail, 'Lost Password', 'user_lostpass_mail', m);
        this.response.body = {};
        this.response.template = 'user_lostpass_mail_sent.html';
    }
}
class UserLostPassWithCodeHandler extends Handler {
    async get({ code }) {
        let tdoc = await token.get(code, token.TYPE_LOSTPASS);
        if (!tdoc) throw new InvalidTokenError(token.TYPE_LOSTPASS, code);
        let udoc = await user.getById(tdoc.uid);
        this.response.body = { uname: udoc.uname };
    }
    async post({ code, password, verify_password }) {
        let tdoc = await token.get(code, token.TYPE_LOSTPASS);
        if (!tdoc) throw new InvalidTokenError(token.TYPE_LOSTPASS, code);
        if (password != verify_password) throw new VerifyPasswordError();
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
        let isSelfProfile = this.ctx.state.user._id == uid;
        let udoc = await user.getById(uid);
        if (!udoc) throw new UserNotFoundError(uid);
        let sdoc = await token.getMostRecentSessionByUid(uid);
        this.ctx.body = { isSelfProfile, udoc, sdoc };
    }
}
class UserSearchHandler extends Handler {
    async get({ q, exact_match = false }) {
        let udocs;
        if (exact_match) udocs = [];
        else udocs = await user.getPrefixList(q, 20);
        try {
            let udoc = await user.getById(parseInt(q));
            if (udoc) udocs.insert(0, udoc);
        } catch (e) {
            /* Ignore */
        }
        for (let i in udocs)
            if (udocs[i].gravatar)
                udocs[i].gravatar_url = misc.gravatar_url[udocs[i].gravatar];
        this.ctx.body = { udocs };
    }
}

Route('/login', UserLoginHandler);
Route('/register', UserRegisterHandler);
Route('/register/:code', UserRegisterWithCodeHandler);
Route('/logout', UserLogoutHandler);
Route('/lostpass', UserLostPassHandler);
Route('/lostpass/:code', UserLostPassWithCodeHandler);
Route('/user/:uid', UserDetailHandler);
Route('/user/search', UserSearchHandler);
