import { Fido2Lib } from 'fido2-lib';
import moment from 'moment-timezone';
import notp from 'notp';
import b32 from 'thirty-two';
import {
    AuthOperationError, BlacklistedError, BuiltinLoginError, ForbiddenError, InvalidTokenError,
    SystemError, UserAlreadyExistError, UserFacingError,
    UserNotFoundError, ValidationError, VerifyPasswordError,
} from '../error';
import { Udoc, User } from '../interface';
import avatar from '../lib/avatar';
import { sendMail } from '../lib/mail';
import { isEmail, isPassword } from '../lib/validator';
import BlackListModel from '../model/blacklist';
import { PERM, PRIV, STATUS } from '../model/builtin';
import * as ContestModel from '../model/contest';
import domain from '../model/domain';
import oauth from '../model/oauth';
import * as oplog from '../model/oplog';
import problem, { ProblemDoc } from '../model/problem';
import ScheduleModel from '../model/schedule';
import SolutionModel from '../model/solution';
import * as system from '../model/system';
import token from '../model/token';
import user from '../model/user';
import {
    Handler, param, post, Types,
} from '../service/server';
import { registerResolver, registerValue } from './api';

function verifyToken(secret: string, code?: string) {
    if (!code || !code.length) return null;
    const bin = b32.decode(secret);
    return notp.totp.verify(code.replace(/\W+/g, ''), bin);
}

const f2l = new Fido2Lib({
    timeout: 60000,
    rpId: new URL(system.get('server.url'), 'https://hydro.local').hostname,
    rpName: system.get('server.name'),
    challengeSize: 128,
    attestation: 'none',
});

function ab2str(buf: ArrayBuffer) {
    return Buffer.from(String.fromCharCode(...new Uint8Array(buf)), 'binary').toString('base64');
}

function str2ab(str: string) {
    return new Uint8Array(Buffer.from(str, 'base64').toString('binary').split('').map((r) => r.charCodeAt(0))).buffer;
}

function b642b64url(str: string) {
    return str.replace(/\+/g, '-').replace(/\//g, '_').replace(/=/g, '');
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
    ['authn', 'Boolean!'],
    ['displayName', 'String'],
]);

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
        if (!system.get('server.login')) throw new BuiltinLoginError();
        this.response.template = 'user_login.html';
    }

    @param('uname', Types.Username)
    @param('password', Types.String)
    @param('rememberme', Types.Boolean)
    @param('redirect', Types.String, true)
    @param('tfa', Types.String, true)
    @param('authnChallenge', Types.String, true)
    async post(
        domainId: string, uname: string, password: string, rememberme = false, redirect = '',
        tfa = '', authnChallenge = '',
    ) {
        if (!system.get('server.login')) throw new BuiltinLoginError();
        let udoc = await user.getByEmail(domainId, uname);
        udoc ||= await user.getByUname(domainId, uname);
        if (!udoc) throw new UserNotFoundError(uname);
        await Promise.all([
            this.limitRate('user_login', 60, 30, false),
            this.limitRate(`user_login_${uname}`, 60, 5, false),
            oplog.log(this, 'user.login', { redirect }),
        ]);
        if (udoc.tfa && !verifyToken(udoc._tfa, tfa)) throw new InvalidTokenError('2FA');
        if (udoc.authn && authnChallenge) {
            const challenge = await token.get(authnChallenge, token.TYPE_WEBAUTHN);
            if (!challenge || challenge.uid !== udoc._id || this.session.challenge !== authnChallenge) throw new InvalidTokenError('Authn');
            if (!challenge.verified || challenge.expiredAt > new Date()) throw new ValidationError('challenge');
        }
        udoc.checkPassword(password);
        await user.setById(udoc._id, { loginat: new Date(), loginip: this.request.ip });
        if (!udoc.hasPriv(PRIV.PRIV_USER_PROFILE)) throw new BlacklistedError(uname, udoc.banReason);
        this.session.viewLang = '';
        this.session.uid = udoc._id;
        this.session.sudo = null;
        this.session.scope = PERM.PERM_ALL.toString();
        this.session.save = rememberme;
        this.response.redirect = (redirect ? decodeURIComponent(redirect) : '')
            || ((this.request.referer || '/login').endsWith('/login')
                ? this.url('homepage')
                : this.request.referer);
    }
}

class UserSudoHandler extends Handler {
    async get() {
        if (!this.session.sudoArgs?.method) throw new ForbiddenError();
        this.response.template = 'user_sudo.html';
    }

    @param('password', Types.String, true)
    @param('tfa', Types.String, true)
    @param('authnChallenge', Types.String, true)
    async post(domainId: string, password: string = '', tfa = '', authnChallenge = '') {
        if (!this.session.sudoArgs?.method) throw new ForbiddenError();
        await Promise.all([
            this.limitRate('user_sudo', 60, 5, true),
            oplog.log(this, 'user.sudo', {}),
        ]);
        if (this.user.authn && authnChallenge) {
            const challenge = await token.get(authnChallenge, token.TYPE_WEBAUTHN);
            if (!challenge || challenge.uid !== this.user._id || !this.session.challenge) throw new InvalidTokenError('Authn');
            if (!challenge.verified || challenge.expiredAt > new Date()) throw new ValidationError('challenge');
        }
        if (tfa) {
            if (!this.user._tfa || !verifyToken(this.user._tfa, tfa)) throw new InvalidTokenError('2FA');
        }
        if (!authnChallenge) this.user.checkPassword(password);
        this.session.sudo = Date.now();
        if (this.session.sudoArgs.method.toLowerCase() !== 'get') {
            this.response.template = 'user_sudo_redirect.html';
            this.response.body = this.session.sudoArgs;
        } else this.response.redirect = this.session.sudoArgs.redirect;
        this.session.sudoArgs.method = null;
    }
}

class UserAuthHandler extends Handler {
    @param('uname', Types.Username, true)
    async get(domainId: string, uname: string) {
        let udoc = this.user;
        if (uname) {
            udoc = await user.getByEmail(domainId, uname);
            udoc ||= await user.getByUname(domainId, uname);
        }
        if (!udoc._id) throw new UserNotFoundError(uname || 'user');
        if (!udoc.authn) throw new AuthOperationError('authn', 'disabled');
        const assertionOptions = await f2l.assertionOptions();
        const options = {
            ...assertionOptions,
            challenge: ab2str(assertionOptions.challenge),
            allowCredentials: udoc._authenticators.map((c) => ({ id: c.credentialId, type: 'public-key', transports: c.transports })),
            rpId: this.request.hostname,
        };
        await token.add(token.TYPE_WEBAUTHN, 60, { uid: udoc._id }, options.challenge);
        this.session.challenge = options.challenge;
        this.response.body.authOptions = options;
    }

    async postRegister() {
        this.checkPriv(PRIV.PRIV_USER_PROFILE);
        const registrationOptions = await f2l.attestationOptions();
        const options = {
            ...registrationOptions,
            challenge: ab2str(registrationOptions.challenge),
            user: {
                id: this.user._id.toString(),
                displayName: this.user.uname,
                name: `${this.user.uname}(${this.user.mail})`,
            },
            rp: {
                name: system.get('server.name'),
                id: this.request.hostname,
            },
            excludeCredentials: this.user._authenticators.map((c) => ({ id: c.credentialId, type: 'public-key', transports: c.transports })),
        };
        await token.add(token.TYPE_WEBAUTHN, 60, { uid: this.user._id }, options.challenge);
        this.session.challenge = options.challenge;
        this.response.body.authOptions = options;
    }

    @param('uname', Types.Username, true)
    @param('credentialId', Types.String)
    @param('clientDataJSON', Types.String)
    @param('authenticatorData', Types.String)
    @param('signature', Types.String)
    async postVerify(
        domainId: string, uname: string, credentialId: string, clientDataJSON: string, authenticatorData: string,
        signature: string,
    ) {
        if (!credentialId) throw new ValidationError('authenticator');
        let udoc = this.user;
        if (uname) {
            udoc = await user.getByEmail(domainId, uname);
            udoc ||= await user.getByUname(domainId, uname);
        }
        if (!udoc._id) throw new UserNotFoundError(uname || 'user');
        if (!udoc.authn) throw new AuthOperationError('authn', 'disabled');
        const authenticator = udoc._authenticators.find((c) => c.credentialId === credentialId);
        if (!authenticator) throw new ValidationError('authenticator');
        const response = {
            id: str2ab(credentialId),
            response: {
                authenticatorData: str2ab(authenticatorData),
                clientDataJSON: b642b64url(clientDataJSON),
                signature: b642b64url(signature),
            },
        };
        try {
            const assertionResult = await f2l.assertionResult(response, {
                challenge: this.session.challenge,
                origin: this.request.headers.origin,
                factor: 'either',
                publicKey: authenticator.publicKey as string,
                prevCounter: authenticator.counter as number,
                userHandle: null,
            });
            await user.setById(this.user._id, {
                authenticators: [...this.user._authenticators.filter((c) => c.credentialId !== credentialId), {
                    ...authenticator,
                    counter: assertionResult.authnrData.get('counter'),
                }],
            });
        } catch (error) {
            throw new ValidationError('authenticator');
        }
        await token.update(this.session.challenge, token.TYPE_WEBAUTHN, 60, { verified: true });
        this.back();
    }

    @param('type', Types.Range(['tfa', 'authn']))
    @param('code', Types.String, true)
    @param('secret', Types.String, true)
    @param('credentialId', Types.String, true)
    @param('credentialName', Types.String, true)
    @param('credentialType', Types.String, true)
    @param('clientDataJSON', Types.String, true)
    @param('attestationObject', Types.String, true)
    @param('transports', Types.CommaSeperatedArray, true)
    @param('authenticatorAttachment', Types.String, true)
    async postEnable(
        domainId: string, type: string, code: string, secret: string, credentialId: string,
        credentialName: string, credentialType: string, clientDataJSON: string, attestationObject: string, transports: string[],
        authenticatorAttachment: string,
    ) {
        if (type === 'tfa') {
            if (this.user._tfa) throw new AuthOperationError('TFA', 'enabled');
            if (!verifyToken(secret, code)) throw new InvalidTokenError('2FA');
            await user.setById(this.user._id, { tfa: secret });
        } else if (type === 'authn') {
            if (!credentialId) throw new ValidationError('authenticator');
            if (this.user._authenticators.filter((i) => i.credentialId === credentialId).length) {
                throw new ValidationError('authenticator');
            }
            const challengeInfo = await token.get(this.session.challenge, token.TYPE_WEBAUTHN);
            if (!challengeInfo || challengeInfo.uid !== this.user._id) throw new InvalidTokenError('Authn');
            const response = {
                id: str2ab(credentialId),
                type: credentialType,
                response: {
                    attestationObject: b642b64url(attestationObject),
                    clientDataJSON: b642b64url(clientDataJSON),
                },
            };
            try {
                const verification = await f2l.attestationResult(response, {
                    challenge: challengeInfo._id,
                    origin: this.request.headers.origin,
                    factor: 'either',
                });
                await user.setById(this.user._id, {
                    authenticators: [...this.user._authenticators, {
                        credentialId: ab2str(verification.authnrData.get('credId')),
                        name: credentialName || 'New Authenticator',
                        transports,
                        authenticatorAttachment,
                        publicKey: verification.authnrData.get('credentialPublicKeyPem') as string,
                        counter: verification.authnrData.get('counter') as number,
                        regat: Date.now(),
                    }],
                });
            } catch (error) {
                throw new ValidationError('authenticator');
            }
        }
        this.back();
    }

    @param('type', Types.Range(['authn', 'tfa']))
    @param('authnChallenge', Types.String, true)
    @param('authnCredentialId', Types.String, true)
    @param('code', Types.String, true)
    async postDisable(domainId: string, type: string, authnChallenge = '', credentialId = '', code = '') {
        if (type === 'tfa') {
            if (!this.user._tfa) throw new AuthOperationError('TFA', 'disabled');
            if (!verifyToken(this.user._tfa, code)) throw new InvalidTokenError('TFA');
            await user.setById(this.user._id, undefined, { tfa: '' });
        } else if (type === 'authn') {
            if (!this.user.authn) throw new AuthOperationError('Authn', 'disabled');
            if (!credentialId) throw new ValidationError('credentialId');
            const challenge = await token.get(authnChallenge, token.TYPE_WEBAUTHN);
            if (!challenge || challenge.uid !== this.user._id || this.session.challenge !== authnChallenge) throw new InvalidTokenError('Authn');
            if (!challenge.verified || challenge.expiredAt > new Date()) throw new ValidationError('challenge');
            if (!this.user._authenticators.find((i) => i.credentialId === credentialId)) throw new ValidationError('authenticator');
            await user.setById(this.user._id, {
                authenticators: this.user._authenticators.filter((i) => i.credentialId !== credentialId),
            });
        }
        this.back();
    }
}

class UserLogoutHandler extends Handler {
    noCheckPermView = true;

    async get() {
        this.response.template = 'user_logout.html';
    }

    async post() {
        this.session.uid = 0;
        this.session.sudo = null;
        this.session.scope = PERM.PERM_ALL.toString();
        this.response.redirect = '/';
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
            await Promise.all([
                this.limitRate('send_mail', 3600, 30, false),
                oplog.log(this, 'user.register', {}),
            ]);
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
        if (!tdoc) throw new InvalidTokenError(token.TYPE_TEXTS[token.TYPE_REGISTRATION], code);
        this.response.body = tdoc;
    }

    @param('password', Types.String, isPassword)
    @param('verifyPassword', Types.String)
    @param('uname', Types.Username)
    @param('code', Types.String)
    async post(
        domainId: string, password: string, verify: string,
        uname: string, code: string,
    ) {
        const tdoc = await token.get(code, token.TYPE_REGISTRATION);
        if (!tdoc || (!tdoc.mail && !tdoc.phone)) throw new InvalidTokenError(token.TYPE_TEXTS[token.TYPE_REGISTRATION], code);
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
        const prefix = this.domain.host
            ? `${this.domain.host instanceof Array ? this.domain.host[0] : this.domain.host}`
            : system.get('server.url');
        const m = await this.renderHTML('user_lostpass_mail.html', {
            url: `/lostpass/${tid}`,
            url_prefix: prefix.endsWith('/') ? prefix.slice(0, -1) : prefix,
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
        if (!tdoc) throw new InvalidTokenError(token.TYPE_TEXTS[token.TYPE_LOSTPASS], code);
        const udoc = await user.getById(domainId, tdoc.uid);
        this.response.body = { uname: udoc.uname };
        this.response.template = 'user_lostpass_with_code.html';
    }

    @param('code', Types.String)
    @param('password', Types.String, isPassword)
    @param('verifyPassword', Types.String)
    async post(domainId: string, code: string, password: string, verifyPassword: string) {
        const tdoc = await token.get(code, token.TYPE_LOSTPASS);
        if (!tdoc) throw new InvalidTokenError(token.TYPE_TEXTS[token.TYPE_LOSTPASS], code);
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
            token.getMostRecentSessionByUid(uid, ['createAt', 'updateAt']),
            domain.get(domainId),
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
                        false, problem.PROJECTION_LIST, true,
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
        const tsdocs = await ContestModel.getMultiStatus(domainId, { uid, attend: { $exists: true } }).project({ docId: 1 }).toArray();
        const tdocs = await ContestModel.getMulti(domainId, { docId: { $in: tsdocs.map((i) => i.docId) } })
            .project({ docId: 1, title: 1, rule: 1 }).sort({ _id: -1 }).toArray();
        this.response.template = 'user_detail.html';
        this.response.body = {
            isSelfProfile, udoc, sdoc, pdocs, tags, tdocs,
        };
        if (this.user.hasPerm(PERM.PERM_VIEW_PROBLEM_SOLUTION)) {
            const psdocs = await SolutionModel.getByUser(domainId, uid).limit(10).toArray();
            this.response.body.psdocs = psdocs;
            if (this.user.hasPerm(PERM.PERM_VIEW_PROBLEM)) {
                this.response.body.pdict = await problem.getList(
                    domainId, psdocs.map((i) => i.parentId), canViewHidden,
                    false, problem.PROJECTION_LIST,
                );
            }
        }
        this.UiContext.extraTitleContent = udoc.uname;
    }
}

class UserDeleteHandler extends Handler {
    async post({ password }) {
        this.user.checkPassword(password);
        const tid = await ScheduleModel.add({
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
        await global.Hydro.module.oauth[type]?.get.call(this);
    }
}

class OauthCallbackHandler extends Handler {
    noCheckPermView = true;

    async get(args: any) {
        if (!global.Hydro.module.oauth[args.type]) throw new UserFacingError('Oauth type');
        const r = await global.Hydro.module.oauth[args.type].callback.call(this, args);
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
                    this.response.redirect = '/';
                    return;
                }
            }
            this.checkPriv(PRIV.PRIV_REGISTER_USER);
            let username = '';
            r.uname ||= [];
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

export async function apply(ctx) {
    ctx.Route('user_login', '/login', UserLoginHandler);
    ctx.Route('user_oauth', '/oauth/:type', OauthHandler);
    ctx.Route('user_sudo', '/user/sudo', UserSudoHandler);
    ctx.Route('user_auth', '/user/auth', UserAuthHandler);
    ctx.Route('user_oauth_callback', '/oauth/:type/callback', OauthCallbackHandler);
    ctx.Route('user_register', '/register', UserRegisterHandler, PRIV.PRIV_REGISTER_USER);
    ctx.Route('user_register_with_code', '/register/:code', UserRegisterWithCodeHandler, PRIV.PRIV_REGISTER_USER);
    ctx.Route('user_logout', '/logout', UserLogoutHandler, PRIV.PRIV_USER_PROFILE);
    ctx.Route('user_lostpass', '/lostpass', UserLostPassHandler);
    ctx.Route('user_lostpass_with_code', '/lostpass/:code', UserLostPassWithCodeHandler);
    ctx.Route('user_delete', '/user/delete', UserDeleteHandler, PRIV.PRIV_USER_PROFILE);
    ctx.Route('user_detail', '/user/:uid(-?\\d+)', UserDetailHandler);
}
