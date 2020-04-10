const
    { GET, POST, ROUTE } = require('../service/server.js'),
    user = require('../model/user'),
    token = require('../model/token'),
    system = require('../model/system'),
    mail = require('../lib/mail'),
    misc = require('../lib/misc'),
    validator = require('../lib/validator'),
    options = require('../options'),
    { PERM_REGISTER_USER, PERM_LOGGEDIN } = require('../permission'),
    { requirePerm, limitRate } = require('./tools'),
    { UserAlreadyExistError, InvalidTokenError, VerifyPasswordError, UserNotFoundError, LoginError } = require('../error');

GET('/user', async ctx => {
    let udoc = await user.getById(ctx.session.uid);
    ctx.templateName = 'user_detail.html';
    ctx.body = { udoc };
});
GET('/login', async ctx => {
    ctx.templateName = 'user_login.html';
});
POST('/login', async ctx => {
    let { uname, password, rememberme = false } = ctx.request.body;
    let udoc = await user.getByUname(uname);
    if (!udoc) throw new LoginError(uname);
    if (udoc) udoc.checkPassword(password);
    await user.setById(udoc._id, { loginat: new Date(), loginip: ctx.request.ip });
    udoc.salt = '';
    udoc.password = '';
    console.log(udoc);
    ctx.session.uid = udoc._id;
    ctx.session.rememberme = rememberme;
    ctx.body = {};
    let referer = ctx.request.headers.referer || '/';
    ctx.setRedirect = referer.endsWith('/login') ? '/' : referer;
});
POST('/logout', requirePerm(PERM_LOGGEDIN), async ctx => {
    ctx.session = { uid: 1 };
    ctx.body = {};
});
GET('/register', requirePerm(PERM_REGISTER_USER), async ctx => {
    ctx.templateName = 'user_register.html';
});
GET('/register/:code', requirePerm(PERM_REGISTER_USER), async ctx => {
    ctx.templateName = 'user_register_with_code.html';
    let code = ctx.params.code;
    let { email } = await token.get(code, token.TYPE_REGISTRATION);
    if (!email) throw new InvalidTokenError(token.TYPE_REGISTRATION, code);
    ctx.body = { email };
});
POST('/register/:code', requirePerm(PERM_REGISTER_USER), async ctx => {
    let code = ctx.params.code;
    let { password, verify_password, uname } = ctx.request.body;
    let { email } = await token.get(code, token.TYPE_REGISTRATION);
    if (!email) throw new InvalidTokenError(token.TYPE_REGISTRATION, code);
    if (password != verify_password) throw new VerifyPasswordError();
    let uid = await system.incUserCounter();
    await user.create({ uid, uname, password, email, regip: ctx.request.ip });
    await token.delete(code, token.TYPE_REGISTRATION);
    ctx.session.uid = uid;
    ctx.body = {};
    ctx.setRedirect = '/';
});

if (options.smtp.user) {
    POST('/register', requirePerm(PERM_REGISTER_USER), limitRate('send_mail', 3600, 30), async ctx => {
        let email = ctx.request.body.mail;
        validator.checkEmail(email);
        if (await user.getByEmail(email, true)) throw new UserAlreadyExistError(email);
        let rid = await token.add(token.TYPE_REGISTRATION, options.registration_token_expire_seconds, { email });
        let m = await ctx.render('user_register_mail', { url: `/register/${rid}` }, true);
        await mail.sendMail(email, 'Sign Up', 'user_register_mail', m);
        ctx.body = {};
    });
    POST('/lostpass', limitRate('send_mail', 3600, 30), async ctx => {
        let email = ctx.request.body.mail;
        validator.checkEmail(email);
        let udoc = await user.getByEmail(email);
        if (!udoc) throw new UserNotFoundError(email);
        let tid = await token.add(
            token.TYPE_LOSTPASS,
            options.lostpass_token_expire_seconds,
            { uid: udoc._id }
        );
        let m = await ctx.render('user_lostpass_mail', { url: `/lostpass/${tid}`, uname: udoc.uname }, true);
        await mail.sendMail(email, 'Lost Password', 'user_lostpass_mail', m);
        ctx.body = {};
    });
    GET('/lostpass/:code', async ctx => {
        let code = ctx.params.code;
        let tdoc = await token.get(code, token.TYPE_LOSTPASS);
        if (!tdoc) throw new InvalidTokenError(token.TYPE_LOSTPASS, code);
        let udoc = await user.getById(tdoc.uid);
        ctx.body = { uname: udoc.uname };
    });
    POST('/lostpass/:code', async ctx => {
        let code = ctx.params.code;
        let password = ctx.request.body.password;
        let verify_password = ctx.request.body.verify_password;
        let tdoc = await token.get(code, token.TYPE_LOSTPASS);
        if (!tdoc) throw new InvalidTokenError(token.TYPE_LOSTPASS, code);
        if (password != verify_password) throw new VerifyPasswordError();
        await user.setPassword(tdoc.uid, password);
        await token.delete(code, token.TYPE_LOSTPASS);
        ctx.redirect('/');
    });
} else
    POST('/register', requirePerm(PERM_REGISTER_USER), limitRate('send_mail', 3600, 60), async ctx => {
        let email = ctx.request.body.mail;
        validator.checkEmail(email);
        if (await user.getByEmail(email, true)) throw new UserAlreadyExistError(email);
        let t = await token.add(token.TYPE_REGISTRATION, options.session.registration_token_expire_seconds, { email });
        ctx.setRedirect = `/register/${t[0]}`;
    });

ROUTE('/user/:uid', class UserDetailHandler {
    constructor(ctx) {
        this.ctx = ctx;
        this.ctx.templateName = 'user_detail.html';
    }
    async get({ uid }) {
        let isSelfProfile = this.ctx.state.user._id == uid;
        let udoc = await user.getById(uid);
        if (!udoc) throw new UserNotFoundError(uid);
        let sdoc = await token.getMostRecentSessionByUid(uid);
        this.ctx.body = { isSelfProfile, udoc, sdoc };
    }
});

ROUTE('/user/search', class UserSearchHandler {
    constructor(ctx) {
        this.ctx = ctx;
    }
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
});
