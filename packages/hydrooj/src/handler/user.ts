import base64url from 'base64url';
import moment from 'moment-timezone';
import notp from 'notp';
import b32 from 'thirty-two';
import webauthn from 'webauthn-lib';
import {
    BlacklistedError, InvalidTokenError, LoginError,
    SystemError, UserAlreadyExistError, UserFacingError,
    UserNotFoundError, ValidationError, VerifyPasswordError,
} from '../error';
import { OAuthUserResponse, Udoc, User } from '../interface';
import avatar from '../lib/avatar';
import { sendMail } from '../lib/mail';
import { isEmail, isPassword, isUname } from '../lib/validator';
import BlackListModel from '../model/blacklist';
import { PERM, PRIV, STATUS } from '../model/builtin';
import domain from '../model/domain';
import oauth from '../model/oauth';
import * as oplog from '../model/oplog';
import problem, { ProblemDoc } from '../model/problem';
import * as system from '../model/system';
import task from '../model/task';
import token from '../model/token';
import user from '../model/user';
import {
    Handler, param, post, Route, Types,
} from '../service/server';
import { registerResolver, registerValue } from './api';

function verifyToken(secret: string, code?: string) {
    if (!code || !code.length) return null;
    const bin = b32.decode(secret);
    return notp.totp.verify(code.replace(/\W+/g, ''), bin);
}

registerValue('User', [
    ['_id', 'Int!'],
    ['uname', 'String!'],
    ['mail', 'String!'],
    ['perm', 'String'],
    ['role', 'String'],
    ['loginat', 'Date'],
    ['regat', 'Date!'],
    ['priv', 'Int!', 'User Privilege'],
    ['avatarUrl', 'String'],
    ['tfa', 'Boolean!'],
    ['webauthn', 'Boolean!'],
]);

registerResolver(
    'User', 'TFA', 'TFAContext', () => ({}),
    'Two Factor Authentication Config',
);
registerResolver(
    'User', 'WebAuthn', 'WebAuthnContext', () => ({}),
    'WebAuthn Authentication Config',
);
registerResolver(
    'TFAContext', 'enable(secret: String!, code: String!)', 'Boolean!',
    async (arg, ctx) => {
        if (ctx.user._tfa) throw new Error('2FA is already enabled');
        if (!verifyToken(arg.secret, arg.code)) throw new Error('Invalid 2FA code');
        await user.setById(ctx.user._id, { tfa: arg.secret });
        // TODO: return backup codes
        return true;
    },
    'Enable Two Factor Authentication for current user',
);
registerResolver(
    'TFAContext', 'disable(code: String!)', 'Boolean!',
    async (arg, ctx) => {
        if (!ctx.user._tfa) throw new Error('2FA is already disabled');
        if (!verifyToken(ctx.user._tfa, arg.code)) throw new Error('Invalid 2FA code');
        await user.setById(ctx.user._id, undefined, { tfa: '' });
        return true;
    },
    'Disable Two Factor Authentication for current user',
);

registerResolver(
    'WebAuthnContext', 'register(_: String!)', 'String!',
    async (arg, ctx) => {
        if (ctx.user.webauthn) throw new Error('WebAuthn is already enabled');
        const makeCredential = webauthn.generateServerMakeCredRequest(ctx.user.uname, '', webauthn.randomBase64URLBuffer());
        const [t] = await token.add(
            token.TYPE_CHALLENGE,
            9000,
            {
                id: ctx.user._id,
                challenge: makeCredential.challenge,
            },
        );
        return JSON.stringify({ token: t, makeCredential });
    },
    'Register WebAuthn Authentication for current user',
);

registerResolver(
    'WebAuthnContext', 'login(uname: String!)', 'String!',
    async (arg, ctx) => {
        const udoc = await user.getByUname(ctx.args.domainId, arg.uname);
        if (!udoc) throw new Error('User not found');

        const getAssertion = webauthn.generateServerGetAssertion([udoc._authenticators]);

        const [t] = await token.add(
            token.TYPE_CHALLENGE,
            90,
            {
                id: udoc._id,
                challenge: getAssertion.challenge,
            },
        );
        return JSON.stringify({ token: t, getAssertion });
    },
    'Register WebAuthn Authentication for current user',
);

registerResolver(
    'WebAuthnContext', 'response(token: String!, data: String!)', 'Boolean!',
    async (arg, ctx) => {
        const tok = await token.get(arg.token, token.TYPE_CHALLENGE);
        const data = JSON.parse(arg.data);
        const clientData = JSON.parse(base64url.decode(data.response.clientDataJSON));

        if (clientData.challenge !== tok.challenge) {
            return false;
        }
        if (clientData.origin !== ctx.request.headers.origin) {
            return false;
        }
        let result;
        if (data.response.attestationObject !== undefined) {
            result = webauthn.verifyAuthenticatorAttestationResponse(data);

            if (result.verified) {
                result.authrInfo.registerTime = new Date();
                await user.setById(tok.id, { authenticators: result.authrInfo });
                return true;
            }
        } else if (data.response.authenticatorsData !== undefined) {
            result = webauthn.verifyAuthenticatorAssertionResponse(data, user.getById(ctx.args.domainId, tok.id, 'authenticators'));

            if (result.verified) {
                return true;
            }
        }
        return false;
    },
    'Response WebAuthn Authentication for current user',
);

registerResolver(
    'WebAuthnContext', 'delete(_: String!)', 'Boolean!',
    async (arg, ctx) => {
        if (!ctx.user.webauthn) throw new Error('WebAuthn is already disabled');
        user.setById(ctx.user._id, undefined, { authenticators: '' });
        return true;
    },
    'Register WebAuthn Authentication for current user',
);

registerResolver('Query', 'user(id: Int, uname: String, mail: String)', 'User', (arg, ctx) => {
    if (arg.id) return user.getById(ctx.args.domainId, arg.id);
    if (arg.mail) return user.getByEmail(ctx.args.domainId, arg.mail);
    if (arg.uname) return user.getByUname(ctx.args.domainId, arg.uname);
    return ctx.user;
}, `Get a user by id, uname, or mail.
Returns current user if no argument is provided.`);

registerResolver('Query', 'users(ids: [Int], search: String, limit: Int, exact: Boolean)', '[User]', async (arg, ctx) => {
    if (arg.ids?.length) {
        const res = await user.getList(ctx.args.domainId, arg.ids);
        return Object.keys(res).map((id) => res[+id]);
    }
    if (!arg.search) return [];
    const udoc = await user.getById(ctx.args.domainId, +arg.search)
        || await user.getByUname(ctx.args.domainId, arg.search)
        || await user.getByEmail(ctx.args.domainId, arg.search);
    const udocs: User[] = arg.exact
        ? []
        : await user.getPrefixList(ctx.args.domainId, arg.search, Math.min(arg.limit || 10, 10));
    if (udoc && !udocs.find((i) => i._id === udoc._id)) {
        udocs.pop();
        udocs.unshift(udoc);
    }
    for (const i in udocs) {
        udocs[i].avatarUrl = avatar(udocs[i].avatar);
    }
    return udocs;
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
    @param('tfa', Types.String, true)
    @param('webauthnResponse', Types.String, true)
    @param('webauthnToken', Types.String, true)
    async post(domainId: string, uname: string, password: string, rememberme = false, redirect = '', tfa = '',
        webauthnResponse = '', webauthnToken = '') {
        if (!system.get('server.login')) throw new LoginError('Builtin login disabled.');
        let udoc = await user.getByEmail(domainId, uname);
        if (!udoc) udoc = await user.getByUname(domainId, uname);
        if (!udoc) throw new UserNotFoundError(uname);
        await Promise.all([
            this.limitRate('user_login', 60, 5),
            oplog.log(this, 'user.login', { redirect }),
        ]);
        if (webauthnResponse !== '') {
            const data = JSON.parse(webauthnResponse);
            const clientData = JSON.parse(base64url.decode(data.response.clientDataJSON));
            const tok = await token.get(webauthnToken, token.TYPE_CHALLENGE);
            if (clientData.challenge !== tok.challenge) {
                throw new LoginError(uname);
            }
            const result = webauthn.verifyAuthenticatorAssertionResponse(data, [udoc._authenticators]);
            if (!result.verified) {
                throw new LoginError(uname);
            }
        } else {
            if (udoc._tfa && !verifyToken(udoc._tfa, tfa)) throw new InvalidTokenError('2FA token invalid.');
            udoc.checkPassword(password);
        }
        await user.setById(udoc._id, { loginat: new Date(), loginip: this.request.ip });
        if (!udoc.hasPriv(PRIV.PRIV_USER_PROFILE)) throw new BlacklistedError(uname);
        this.session.viewLang = '';
        this.session.uid = udoc._id;
        this.session.scope = PERM.PERM_ALL.toString();
        this.session.save = rememberme;
        this.response.redirect = (redirect ? decodeURIComponent(redirect) : '')
            || ((this.request.referer || '/login').endsWith('/login')
                ? this.url('homepage')
                : this.request.referer);
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
                { mail, redirect: this.domain.registerRedirect },
            );
            const prefix = this.domain.host
                ? `${this.domain.host instanceof Array ? this.domain.host[0] : this.domain.host}`
                : system.get('server.url');
            if (system.get('smtp.verify') && system.get('smtp.user')) {
                const m = await this.renderHTML('user_register_mail.html', {
                    path: `/register/${t[0]}`,
                    url_prefix: prefix.endsWith('/') ? prefix.slice(0, -1) : prefix,
                });
                await sendMail(mail, 'Sign Up', 'user_register_mail', m);
                this.response.template = 'user_register_mail_sent.html';
                this.response.body = { mail };
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
        } else throw new ValidationError('mail');
    }
}

class UserRegisterWithCodeHandler extends Handler {
    noCheckPermView = true;

    @param('code', Types.String)
    async get(domainId: string, code: string) {
        this.response.template = 'user_register_with_code.html';
        const tdoc = await token.get(code, token.TYPE_REGISTRATION);
        if (!tdoc) throw new InvalidTokenError(token.TYPE_REGISTRATION, code);
        this.response.body = tdoc;
    }

    @param('password', Types.String, isPassword)
    @param('verifyPassword', Types.String)
    @param('uname', Types.Name, isUname)
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
        const [id, mailDomain] = tdoc.mail.split('@');
        const $set: any = {};
        if (mailDomain === 'qq.com' && !Number.isNaN(+id)) $set.avatar = `qq:${id}`;
        if (this.session.viewLang) $set.viewLang = this.session.viewLang;
        if (Object.keys($set).length) await user.setById(uid, $set);
        this.session.viewLang = '';
        this.session.uid = uid;
        this.session.scope = PERM.PERM_ALL.toString();
        this.response.redirect = tdoc.redirect || this.url('home_settings', { category: 'preference' });
    }
}

class UserLostPassHandler extends Handler {
    noCheckPermView = true;

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
                ? `${this.domain.host instanceof Array ? this.domain.host[0] : this.domain.host}`
                : system.get('server.url'),
            uname: udoc.uname,
        });
        await sendMail(mail, 'Lost Password', 'user_lostpass_mail', m);
        this.response.template = 'user_lostpass_mail_sent.html';
    }
}

class UserLostPassWithCodeHandler extends Handler {
    noCheckPermView = true;

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
        const [udoc, sdoc, union] = await Promise.all([
            user.getById(domainId, uid),
            token.getMostRecentSessionByUid(uid),
            domain.getUnion(domainId),
        ]);
        if (!udoc) throw new UserNotFoundError(uid);
        const pdocs: ProblemDoc[] = [];
        const acInfo: Record<string, number> = {};
        const canViewHidden = this.user.hasPerm(PERM.PERM_VIEW_PROBLEM_HIDDEN) || this.user._id;
        if (this.user.hasPerm(PERM.PERM_VIEW_PROBLEM)) {
            await Promise.all([domainId, ...(union?.union || [])].map(async (did) => {
                const psdocs = await problem.getMultiStatus(did, { uid, status: STATUS.STATUS_ACCEPTED }).toArray();
                pdocs.push(...Object.values(
                    await problem.getList(
                        did, psdocs.map((i) => i.docId), canViewHidden,
                        this.user.group, false, problem.PROJECTION_LIST, true,
                    ),
                ));
            }));
        }
        for (const pdoc of pdocs) {
            for (const tag of pdoc.tag) {
                if (acInfo[tag]) acInfo[tag]++;
                else acInfo[tag] = 1;
            }
        }
        const tags = Object.entries(acInfo).sort((a, b) => b[1] - a[1]).slice(0, 20);
        // Remove sensitive data
        if (!isSelfProfile && sdoc) {
            sdoc.createIp = '';
            sdoc.updateIp = '';
            sdoc._id = '';
        }
        this.response.template = 'user_detail.html';
        this.response.body = {
            isSelfProfile, udoc, sdoc, pdocs, tags,
        };
        this.UiContext.extraTitleContent = udoc.uname;
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

class OauthHandler extends Handler {
    noCheckPermView = true;

    @param('type', Types.String)
    async get(domainId: string, type: string) {
        await global.Hydro.lib[`oauth_${type}`]?.get?.call(this);
    }
}

class OauthCallbackHandler extends Handler {
    noCheckPermView = true;

    async get(args: any) {
        if (!global.Hydro.lib[`oauth_${args.type}`]) throw new UserFacingError('Oauth type');
        const r = await global.Hydro.lib[`oauth_${args.type}`].callback.call(this, args) as OAuthUserResponse;
        const uid = await oauth.get(r._id);
        if (uid) {
            await user.setById(uid, { loginat: new Date(), loginip: this.request.ip });
            this.session.uid = uid;
            this.session.scope = PERM.PERM_ALL.toString();
        } else {
            if (r.email) {
                const udoc = await user.getByEmail('system', r.email);
                if (udoc) {
                    await user.setById(udoc._id, { loginat: new Date(), loginip: this.request.ip });
                    this.session.uid = udoc._id;
                    this.session.scope = PERM.PERM_ALL.toString();
                    return;
                }
            }
            this.checkPriv(PRIV.PRIV_REGISTER_USER);
            let username = '';
            r.uname = r.uname || [];
            r.uname.push(String.random(16));
            const mailDomain = r.email.split('@')[1];
            if (await BlackListModel.get(`mail::${mailDomain}`)) throw new BlacklistedError(mailDomain);
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
            const $set: Partial<Udoc> = {
                oauth: args.type,
                loginat: new Date(),
                loginip: this.request.ip,
            };
            if (r.bio) $set.bio = r.bio;
            if (r.viewLang) $set.viewLang = r.viewLang;
            if (r.avatar) $set.avatar = r.avatar;
            await Promise.all([
                user.setById(_id, $set),
                oauth.set(r.email, _id),
            ]);
            this.session.uid = _id;
            this.session.scope = PERM.PERM_ALL.toString();
        }
        this.response.redirect = '/';
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
    Route('user_delete', '/user/delete', UserDeleteHandler, PRIV.PRIV_USER_PROFILE);
    Route('user_detail', '/user/:uid', UserDetailHandler);
}

global.Hydro.handler.user = apply;
