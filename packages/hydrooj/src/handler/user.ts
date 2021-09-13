import moment from 'moment-timezone';
import {
    BlacklistedError, InvalidTokenError, LoginError,
    SystemError, UserAlreadyExistError, UserFacingError,
    UserNotFoundError, VerifyPasswordError,
} from '../error';
import { User } from '../interface';
import avatar from '../lib/avatar';
import { sendMail } from '../lib/mail';
import paginate from '../lib/paginate';
import { isEmail, isPassword, isUname } from '../lib/validator';
import BlackListModel from '../model/blacklist';
import { PERM, PRIV } from '../model/builtin';
import oauth from '../model/oauth';
import problem, { ProblemDoc } from '../model/problem';
import record from '../model/record';
import * as system from '../model/system';
import task from '../model/task';
import token from '../model/token';
import user from '../model/user';
import {
    Handler, param, post, Route, Types,
} from '../service/server';
import { registerResolver, registerValue } from './api';

registerValue('User', [
    ['_id', 'Int!'],
    ['uname', 'String!'],
    ['mail', 'String!'],
    ['perm', 'Int'],
    ['scope', 'Int'],
    ['role', 'String'],
    ['loginat', 'Date'],
    ['regat', 'Date'],
    ['priv', 'Int', 'User Privilege'],
]);

registerResolver('Query', 'user(id: Int, uname: String, mail: String)', 'User', (arg, ctx) => {
    if (arg.id) return user.getById(ctx.domainId, arg.id);
    if (arg.mail) return user.getByEmail(ctx.domainId, arg.mail);
    if (arg.uname) return user.getByUname(ctx.domainId, arg.uname);
    return ctx.user;
}, `Get a user by id, uname, or mail.
Returns current user if no argument is provided.`);

registerResolver('Query', 'users(ids: [Int], search: String)', '[User]', async (arg, ctx) => {
    if (arg.ids) {
        const res = await user.getList(ctx.domainId, arg.ids);
        return Object.keys(res).map((id) => res[+id]);
    }
    return arg.search ? await user.getPrefixList(ctx.domainId, arg.search) : [];
}, 'Get a list of user by ids, or search users with the prefix.');

class UserLoginHandler extends Handler {
    noCheckPermView = true;

    async get() {
        if (!system.get('server.login')) throw new LoginError('Builtin login disabled.');
        this.response.template = 'user_login.html';
    }

    @param('uname', Types.String)
    @param('password', Types.String)
    @param('rememberme', Types.Boolean)
    @param('redirect', Types.String, true)
    async post(domainId: string, uname: string, password: string, rememberme = false, redirect = '') {
        if (!system.get('server.login')) throw new LoginError('Builtin login disabled.');
        const udoc = await user.getByUname(domainId, uname);
        if (!udoc) throw new UserNotFoundError(uname);
        udoc.checkPassword(password);
        await user.setById(udoc._id, { loginat: new Date(), loginip: this.request.ip });
        if (!udoc.hasPriv(PRIV.PRIV_USER_PROFILE)) throw new BlacklistedError(uname);
        this.session.uid = udoc._id;
        this.session.scope = PERM.PERM_ALL.toString();
        this.session.save = rememberme;
        this.response.redirect = redirect || (this.request.referer || '/login').endsWith('/login')
            ? this.url('homepage')
            : this.request.referer;
    }
}

class UserLogoutHandler extends Handler {
    noCheckPermView = true;

    async get() {
        this.response.template = 'user_logout.html';
    }

    async post() {
        this.session.uid = 0;
        this.session.scope = PERM.PERM_ALL.toString();
    }
}

export class UserRegisterHandler extends Handler {
    noCheckPermView = true;

    async get() {
        this.response.template = 'user_register.html';
    }

    @post('mail', Types.String, true, isEmail)
    @post('phone', Types.String, true, (s) => /^\d{11}$/.test(s))
    async post(domainId: string, mail: string, phoneNumber: string) {
        if (mail) {
            if (await user.getByEmail('system', mail)) throw new UserAlreadyExistError(mail);
            const mailDomain = mail.split('@')[1];
            if (await BlackListModel.get(`mail::${mailDomain}`)) throw new BlacklistedError(mailDomain);
            await this.limitRate('send_mail', 3600, 30);
            const t = await token.add(
                token.TYPE_REGISTRATION,
                system.get('session.unsaved_expire_seconds'),
                { mail },
            );
            if (system.get('smtp.verify') && system.get('smtp.user')) {
                const m = await this.renderHTML('user_register_mail.html', {
                    path: `register/${t[0]}`,
                    url_prefix: this.domain.host
                        ? `${this.domain.host instanceof Array ? this.domain.host[0] : this.domain.host}/`
                        : system.get('server.url'),
                });
                await sendMail(mail, 'Sign Up', 'user_register_mail', m);
                this.response.template = 'user_register_mail_sent.html';
            } else this.response.redirect = this.url('user_register_with_code', { code: t[0] });
        } else if (phoneNumber) {
            if (!global.Hydro.lib.sendSms) throw new SystemError('Cannot send sms');
            await this.limitRate('send_sms', 60, 3);
            const t = await token.add(
                token.TYPE_REGISTRATION,
                system.get('session.unsaved_expire_seconds'),
                { phone: phoneNumber },
                String.random(6),
            );
            await global.Hydro.lib.sendSms(phoneNumber, 'register', t[0]);
            this.response.template = 'user_register_sms.html';
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
        const tdoc = await token.get(code, token.TYPE_REGISTRATION);
        if (!tdoc || (!tdoc.mail && !tdoc.phone)) throw new InvalidTokenError(token.TYPE_REGISTRATION, code);
        if (password !== verify) throw new VerifyPasswordError();
        if (tdoc.phone) tdoc.mail = `${tdoc.phone}@hydro.local`;
        const uid = await user.create(tdoc.mail, uname, password, undefined, this.request.ip);
        await token.del(code, token.TYPE_REGISTRATION);
        const [id, domain] = tdoc.mail.split('@');
        if (domain === 'qq.com' && !Number.isNaN(+id)) await user.setById(uid, { avatar: `qq:${id}` });
        this.session.uid = uid;
        this.session.scpoe = PERM.PERM_ALL.toString();
        this.response.redirect = this.url('home_settings', { category: 'preference' });
    }
}

class UserLostPassHandler extends Handler {
    async get() {
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
        const m = await this.renderHTML('user_lostpass_mail.html', {
            url: `lostpass/${tid}`,
            url_prefix: this.domain.host
                ? `${this.domain.host instanceof Array ? this.domain.host[0] : this.domain.host}/`
                : system.get('server.url'),
            uname: udoc.uname,
        });
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
        this.response.template = 'user_lostpass_with_code.html';
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
        if (uid === 0) throw new UserNotFoundError(0);
        const isSelfProfile = this.user._id === uid;
        const udoc = await user.getById(domainId, uid);
        if (!udoc) throw new UserNotFoundError(uid);
        const [sdoc, rdocs, [pdocs, pcount]] = await Promise.all([
            token.getMostRecentSessionByUid(uid),
            record.getByUid(domainId, uid, 30),
            this.user.hasPerm(PERM.PERM_VIEW_PROBLEM)
                ? paginate(
                    problem.getMulti(domainId, { owner: uid }),
                    1,
                    100,
                )
                : [[], 0, 0] as [ProblemDoc[], number, number],
        ]);
        const pdict = this.user.hasPerm(PERM.PERM_VIEW_PROBLEM)
            ? await problem.getList(
                domainId, rdocs.map((rdoc) => rdoc.pid),
                this.user.hasPerm(PERM.PERM_VIEW_PROBLEM_HIDDEN) || this.user._id, false,
            )
            : Object.fromEntries(rdocs.map(
                (rdoc) => [rdoc.pid, { ...problem.default, pid: rdoc.pid }],
            ));
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
        this.extraTitleContent = udoc.uname;
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
        let udoc = await user.getById(domainId, +q);
        const udocs: User[] = udoc ? [udoc] : [];
        if (!udocs.length) {
            udoc = await user.getByUname(domainId, q);
            if (udoc) udocs.push(udoc);
            else {
                udoc = await user.getByEmail(domainId, q);
                if (udoc) udocs.push(udoc);
            }
        }
        if (!exactMatch) udocs.push(...await user.getPrefixList(domainId, q, 20));
        for (const i in udocs) {
            udocs[i].avatarUrl = avatar(udocs[i].avatar);
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
    Route('user_register_without_code', '/register/code', UserRegisterWithCodeHandler, PRIV.PRIV_REGISTER_USER);
    Route('user_register_with_code', '/register/:code', UserRegisterWithCodeHandler, PRIV.PRIV_REGISTER_USER);
    Route('user_logout', '/logout', UserLogoutHandler, PRIV.PRIV_USER_PROFILE);
    Route('user_lostpass', '/lostpass', UserLostPassHandler);
    Route('user_lostpass_with_code', '/lostpass/:code', UserLostPassWithCodeHandler);
    Route('user_search', '/user/search', UserSearchHandler, PRIV.PRIV_USER_PROFILE);
    Route('user_delete', '/user/delete', UserDeleteHandler, PRIV.PRIV_USER_PROFILE);
    Route('user_detail', '/user/:uid', UserDetailHandler);
}

global.Hydro.handler.user = apply;
