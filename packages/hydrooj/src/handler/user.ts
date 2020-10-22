import moment from 'moment-timezone';
import {
    UserAlreadyExistError, InvalidTokenError, VerifyPasswordError,
    UserNotFoundError, SystemError, BlacklistedError,
    UserFacingError,
} from '../error';
import {
    Route, Handler, Types, param,
} from '../service/server';
import * as user from '../model/user';
import * as oauth from '../model/oauth';
import * as token from '../model/token';
import * as record from '../model/record';
import * as problem from '../model/problem';
import * as task from '../model/task';
import * as system from '../model/system';
import { PERM, PRIV } from '../model/builtin';
import { isEmail, isPassword, isUname } from '../lib/validator';
import { sendMail } from '../lib/mail';
import * as misc from '../lib/misc';
import paginate from '../lib/paginate';
import { User } from '../interface';

class UserLoginHandler extends Handler {
    async get() {
        this.response.template = 'user_login.html';
    }

    @param('uname', Types.String)
    @param('password', Types.String)
    @param('rememberme', Types.Boolean)
    async post(domainId: string, uname: string, password: string, rememberme = false) {
        const udoc = await user.getByUname(domainId, uname);
        if (!udoc) throw new UserNotFoundError(uname);
        udoc.checkPassword(password);
        await user.setById(udoc._id, { loginat: new Date(), loginip: this.request.ip });
        if (udoc.priv === PRIV.PRIV_NONE) throw new BlacklistedError(uname);
        this.session.uid = udoc._id;
        this.session.scope = PERM.PERM_ALL.toString();
        this.session.save = rememberme;
        this.response.redirect = this.request.referer.endsWith('/login') ? '/' : this.request.referer;
    }
}

class UserLogoutHandler extends Handler {
    async get() {
        this.response.template = 'user_logout.html';
    }

    async post() {
        this.session.uid = 0;
        this.session.scope = PERM.PERM_ALL.toString();
    }
}

class UserRegisterHandler extends Handler {
    async get() {
        this.response.template = 'user_register.html';
    }

    @param('mail', Types.String, isEmail)
    async post(domainId: string, mail: string) {
        if (await user.getByEmail('system', mail)) throw new UserAlreadyExistError(mail);
        this.limitRate('send_mail', 3600, 30);
        const t = await token.add(
            token.TYPE_REGISTRATION,
            system.get('session.unsaved_expire_seconds'),
            { mail },
        );
        if (system.get('smtp.user')) {
            const m = await this.renderHTML('user_register_mail.html', {
                path: `register/${t[0]}`,
                url_prefix: system.get('server.url'),
            });
            await sendMail(mail, 'Sign Up', 'user_register_mail', m);
            this.response.template = 'user_register_mail_sent.html';
        } else {
            this.response.redirect = this.url('user_register_with_code', { code: t[0] });
        }
    }
}

class UserRegisterWithCodeHandler extends Handler {
    @param('code', Types.String)
    async get(domainId: string, code: string) {
        this.response.template = 'user_register_with_code.html';
        const tdoc = await token.get(code, token.TYPE_REGISTRATION);
        if (!tdoc) throw new InvalidTokenError(token.TYPE_REGISTRATION, code);
        this.response.body = tdoc;
    }

    @param('password', Types.String, isPassword)
    @param('verifyPassword', Types.String)
    @param('uname', Types.String, isUname)
    @param('code', Types.String)
    async post(
        domainId: string, password: string, verify: string,
        uname: string, code: string,
    ) {
        const { mail } = await token.get(code, token.TYPE_REGISTRATION);
        if (!mail) throw new InvalidTokenError(token.TYPE_REGISTRATION, code);
        if (password !== verify) throw new VerifyPasswordError();
        const uid = await user.create(mail, uname, password, undefined, this.request.ip);
        await token.del(code, token.TYPE_REGISTRATION);
        this.session.uid = uid;
        this.session.scpoe = PERM.PERM_ALL;
        this.response.redirect = this.url('homepage');
    }
}

class UserLostPassHandler extends Handler {
    async get() {
        if (!system.get('smtp.user')) throw new SystemError('Cannot send mail');
        this.response.template = 'user_lostpass.html';
    }

    @param('mail', Types.String, isEmail)
    async post(domainId: string, mail: string) {
        if (!system.get('smtp.user')) throw new SystemError('Cannot send mail');
        const udoc = await user.getByEmail('system', mail);
        if (!udoc) throw new UserNotFoundError(mail);
        const [tid] = await token.add(
            token.TYPE_LOSTPASS,
            system.get('session.unsaved_expire_seconds'),
            { uid: udoc._id },
        );
        const m = await this.renderHTML('user_lostpass_mail', { url: `lostpass/${tid}`, uname: udoc.uname });
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

    @param('code', Types.String)
    @param('password', Types.String, isPassword)
    @param('verifyPassword', Types.String)
    async post(domainId: string, code: string, password: string, verifyPassword: string) {
        const tdoc = await token.get(code, token.TYPE_LOSTPASS);
        if (!tdoc) throw new InvalidTokenError(token.TYPE_LOSTPASS, code);
        if (password !== verifyPassword) throw new VerifyPasswordError();
        await user.setPassword(tdoc.uid, password);
        await token.del(code, token.TYPE_LOSTPASS);
        this.response.redirect = this.url('homepage');
    }
}

class UserDetailHandler extends Handler {
    @param('uid', Types.Int)
    async get(domainId: string, uid: number) {
        const isSelfProfile = this.user._id === uid;
        const udoc = await user.getById(domainId, uid);
        if (!udoc) throw new UserNotFoundError(uid);
        const [sdoc, rdocs, [pdocs, pcount]] = await Promise.all([
            token.getMostRecentSessionByUid(uid),
            record.getByUid(domainId, uid, 30),
            paginate(
                problem.getMulti(domainId, { owner: this.user._id }),
                1,
                100,
            ),
        ]);
        const pdict = await problem.getList(
            domainId, rdocs.map((rdoc) => rdoc.pid),
            this.user.hasPerm(PERM.PERM_VIEW_PROBLEM_HIDDEN), false,
        );
        // Remove sensitive data
        if (!isSelfProfile && sdoc) {
            sdoc.createIp = '';
            sdoc.updateIp = '';
            sdoc._id = '';
        }
        const path = [
            ['Hydro', 'homepage'],
            ['user_detail', 'user_detail', { uid }],
        ];
        this.response.template = 'user_detail.html';
        this.response.body = {
            isSelfProfile, udoc, sdoc, rdocs, pdocs, pcount, pdict, path,
        };
    }
}

class UserDeleteHandler extends Handler {
    async post({ password }) {
        this.user.checkPassword(password);
        const tid = await task.add({
            executeAfter: moment().add(7, 'days').toDate(),
            type: 'script',
            id: 'deleteUser',
            args: { uid: this.user._id },
        });
        await user.setById(this.user._id, { del: tid });
        this.response.template = 'user_delete_pending.html';
    }
}

class UserSearchHandler extends Handler {
    @param('q', Types.String)
    @param('exectMatch', Types.Boolean)
    async get(domainId: string, q: string, exactMatch = false) {
        let udoc = await user.getById(domainId, parseInt(q, 10));
        const udocs: User[] = udoc ? [udoc] : [];
        udoc = await user.getByUname(domainId, q);
        if (udoc) udocs.push(udoc);
        udoc = await user.getByEmail(domainId, q);
        if (udoc) udocs.push(udoc);
        if (!exactMatch) udocs.push(...await user.getPrefixList(domainId, q, 20));
        for (const i in udocs) {
            udocs[i].gravatar = misc.gravatar(udocs[i].gravatar || '');
        }
        this.response.body = udocs;
    }
}

class OauthHandler extends Handler {
    @param('type', Types.String)
    async get(domainId: string, type: string) {
        if (global.Hydro.lib[`oauth_${type}`]) await global.Hydro.lib[`oauth_${type}`].get.call(this);
    }
}

class OauthCallbackHandler extends Handler {
    async get(args: any) {
        let r;
        if (global.Hydro.lib[`oauth_${args.type}`]) r = await global.Hydro.lib[`oauth_${args.type}`].callback.call(this, args);
        else throw new UserFacingError('Oauth type');
        const uid = await oauth.get(r._id);
        if (uid) {
            this.session.uid = uid;
            this.session.scope = PERM.PERM_ALL.toString();
        } else {
            this.checkPriv(PRIV.PRIV_REGISTER_USER);
            let username = '';
            r.uname = r.uname || [];
            r.uname.push(String.random(16));
            for (const uname of r.uname) {
                // eslint-disable-next-line no-await-in-loop
                const nudoc = await user.getByUname('system', uname);
                if (!nudoc) {
                    username = uname;
                    break;
                }
            }
            const _id = await user.create(
                r.email, username, String.random(32),
                undefined, this.request.ip,
            );
            const $set: any = {
                oauth: args.type,
            };
            if (r.bio) $set.bio = r.bio;
            if (r.viewLang) $set.viewLang = r.viewLang;
            await Promise.all([
                user.setById(_id, $set),
                oauth.set(r.email, _id),
            ]);
            this.session.uid = _id;
            this.session.scope = PERM.PERM_ALL.toString();
        }
    }
}

export async function apply() {
    Route('user_login', '/login', UserLoginHandler);
    Route('user_oauth', '/oauth/:type', OauthHandler);
    Route('user_oauth_callback', '/oauth/:type/callback', OauthCallbackHandler);
    Route('user_register', '/register', UserRegisterHandler, PRIV.PRIV_REGISTER_USER);
    Route('user_register_with_code', '/register/:code', UserRegisterWithCodeHandler, PRIV.PRIV_REGISTER_USER);
    Route('user_logout', '/logout', UserLogoutHandler, PRIV.PRIV_USER_PROFILE);
    Route('user_lostpass', '/lostpass', UserLostPassHandler);
    Route('user_lostpass_with_code', '/lostpass/:code', UserLostPassWithCodeHandler);
    Route('user_search', '/user/search', UserSearchHandler, PRIV.PRIV_USER_PROFILE);
    Route('user_delete', '/user/delete', UserDeleteHandler, PRIV.PRIV_USER_PROFILE);
    Route('user_detail', '/user/:uid', UserDetailHandler);
}

global.Hydro.handler.user = apply;
