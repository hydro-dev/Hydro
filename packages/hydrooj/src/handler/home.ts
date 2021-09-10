import yaml from 'js-yaml';
import { ObjectID } from 'mongodb';
import {
    BlacklistedError,
    DomainAlreadyExistsError, InvalidTokenError,
    NotFoundError, PermissionError,
    UserAlreadyExistError, UserNotFoundError, ValidationError,     VerifyPasswordError } from '../error';
import { DomainDoc, MessageDoc, Setting } from '../interface';
import avatar from '../lib/avatar';
import { md5 } from '../lib/crypto';
import * as mail from '../lib/mail';
import { isDomainId, isEmail, isPassword } from '../lib/validator';
import BlackListModel from '../model/blacklist';
import { PERM, PRIV } from '../model/builtin';
import * as contest from '../model/contest';
import * as discussion from '../model/discussion';
import * as document from '../model/document';
import domain from '../model/domain';
import message from '../model/message';
import ProblemModel from '../model/problem';
import * as setting from '../model/setting';
import * as system from '../model/system';
import token from '../model/token';
import * as training from '../model/training';
import user from '../model/user';
import * as bus from '../service/bus';
import {
    Connection, ConnectionHandler, Handler, param,     Route, Types,
} from '../service/server';

const { geoip, useragent } = global.Hydro.lib;

class HomeHandler extends Handler {
    uids = new Set<number>();

    collectUser(uids: number[]) {
        uids.forEach((uid) => this.uids.add(uid));
    }

    async getHomework(domainId: string, limit: number = 5) {
        if (this.user.hasPerm(PERM.PERM_VIEW_HOMEWORK)) {
            const tdocs = await contest.getMulti(domainId, {}, document.TYPE_HOMEWORK)
                .sort('beginAt', -1).limit(limit).toArray();
            const tsdict = await contest.getListStatus(
                domainId, this.user._id,
                tdocs.map((tdoc) => tdoc.docId), document.TYPE_HOMEWORK,
            );
            return ['homework', tdocs, tsdict];
        }
        return ['homework', [], {}];
    }

    async getContest(domainId: string, limit: number = 10) {
        if (this.user.hasPerm(PERM.PERM_VIEW_CONTEST)) {
            const tdocs = await contest.getMulti(domainId)
                .sort('beginAt', -1).limit(limit).toArray();
            const tsdict = await contest.getListStatus(
                domainId, this.user._id, tdocs.map((tdoc) => tdoc.docId),
            );
            return ['contest', tdocs, tsdict];
        }
        return ['contest', [], {}];
    }

    async getTraining(domainId: string, limit: number = 10) {
        if (this.user.hasPerm(PERM.PERM_VIEW_TRAINING)) {
            const tdocs = await training.getMulti(domainId)
                .sort('_id', 1).limit(limit).toArray();
            const tsdict = await training.getListStatus(
                domainId, this.user._id, tdocs.map((tdoc) => tdoc.docId),
            );
            return ['training', tdocs, tsdict];
        }
        return ['training', [], {}];
    }

    async getDiscussion(domainId: string, limit: number = 20) {
        if (this.user.hasPerm(PERM.PERM_VIEW_DISCUSSION)) {
            const ddocs = await discussion.getMulti(domainId).limit(limit).toArray();
            const vndict = await discussion.getListVnodes(
                domainId, ddocs, this.user.hasPerm(PERM.PERM_VIEW_PROBLEM_HIDDEN),
            );
            this.collectUser(ddocs.map((ddoc) => ddoc.owner));
            return ['discussion', ddocs, vndict];
        }
        return ['discussion', [], {}];
    }

    async getRanking(domainId: string, limit: number = 50) {
        if (this.user.hasPerm(PERM.PERM_VIEW_RANKING)) {
            const dudocs = await domain.getMultiUserInDomain(domainId, { uid: { $nin: [0, 1] } })
                .sort({ rp: -1 }).project({ uid: 1 }).limit(limit).toArray();
            const uids = dudocs.map((dudoc) => dudoc.uid);
            this.collectUser(uids);
            return ['ranking', uids];
        }
        return ['ranking', []];
    }

    async get({ domainId }) {
        const homepageConfig = system.get('hydrooj.homepage');
        const tasks = [];
        const info = yaml.load(homepageConfig) as any;
        for (const key in info) {
            const func = `get${key.replace(/^[a-z]/, (i) => i.toUpperCase())}`;
            if (!this[func]) continue;
            tasks.push(this[func](domainId, +info[key]));
        }
        const contents = await Promise.all(tasks);
        const [udict, dodoc, vnodes] = await Promise.all([
            user.getList(domainId, Array.from(this.uids)),
            domain.get(domainId),
            discussion.getNodes(domainId),
        ]);
        this.response.template = 'main.html';
        this.response.body = {
            contents,
            udict,
            domain: dodoc,
            vnodes,
        };
    }
}

class HomeSecurityHandler extends Handler {
    async get() {
        // TODO(iceboy): pagination? or limit session count for uid?
        const sessions = await token.getSessionListByUid(this.user._id);
        for (const session of sessions) {
            session.isCurrent = session._id === this.session._id;
            session._id = md5(session._id);
            if (useragent) session.updateUa = useragent.parse(session.updateUa || session.createUa || '');
            if (geoip) {
                session.updateGeoip = geoip.lookup(
                    session.updateIp || session.createIp,
                    this.translate('geoip_locale'),
                );
            }
        }
        const path = [
            ['Hydro', 'homepage'],
            ['home_security', null],
        ];
        this.response.template = 'home_security.html';
        this.response.body = { sessions, geoipProvider: geoip?.provider, path };
        if (useragent) this.response.body.icon = useragent.icon;
    }

    @param('current', Types.String)
    @param('password', Types.String, isPassword)
    @param('verifyPassword', Types.String)
    async postChangePassword(_: string, current: string, password: string, verify: string) {
        if (password !== verify) throw new VerifyPasswordError();
        this.user.checkPassword(current);
        await user.setPassword(this.user._id, password);
        await token.delByUid(this.user._id);
        this.response.redirect = this.url('user_login');
    }

    @param('password', Types.String)
    @param('mail', Types.Name, isEmail)
    async postChangeMail(domainId: string, current: string, email: string) {
        const mailDomain = email.split('@')[1];
        if (await BlackListModel.get(`mail::${mailDomain}`)) throw new BlacklistedError(mailDomain);
        this.user.checkPassword(current);
        const udoc = await user.getByEmail(domainId, email);
        if (udoc) throw new UserAlreadyExistError(email);
        await this.limitRate('send_mail', 3600, 30);
        const [code] = await token.add(
            token.TYPE_CHANGEMAIL,
            system.get('session.unsaved_expire_seconds'),
            { uid: this.user._id, email },
        );
        const m = await this.renderHTML('user_changemail_mail.html', {
            path: `home/changeMail/${code}`,
            uname: this.user.uname,
            url_prefix: (this.domain.host || [])[0] || system.get('server.url'),
        });
        await mail.sendMail(email, 'Change Email', 'user_changemail_mail', m);
        this.response.template = 'user_changemail_mail_sent.html';
    }

    @param('tokenDigest', Types.String)
    async postDeleteToken(domainId: string, tokenDigest: string) {
        const sessions = await token.getSessionListByUid(this.user._id);
        for (const session of sessions) {
            if (tokenDigest === md5(session._id)) {
                // eslint-disable-next-line no-await-in-loop
                await token.del(session._id, token.TYPE_SESSION);
                return this.back();
            }
        }
        throw new InvalidTokenError(tokenDigest);
    }

    async postDeleteAllTokens() {
        await token.delByUid(this.user._id);
        this.response.redirect = this.url('user_login');
    }
}

function set(s: Setting, key: string, value: any) {
    if (s) {
        if (s.flag & setting.FLAG_DISABLED) return undefined;
        if ((s.flag & setting.FLAG_SECRET) && !value) return undefined;
        if (s.type === 'boolean') {
            if (value === 'on') return true;
            return false;
        }
        if (s.type === 'number') {
            if (!Number.isSafeInteger(+value)) throw new ValidationError(key);
            return +value;
        }
        if (s.subType === 'yaml') {
            try {
                yaml.load(value);
            } catch (e) {
                throw new ValidationError(key);
            }
        }
        return value;
    }
    return undefined;
}

class HomeSettingsHandler extends Handler {
    @param('category', Types.Name)
    async get(domainId: string, category: string) {
        const path = [
            ['Hydro', 'homepage'],
            [`home_${category}`, null],
        ];
        this.response.template = 'home_settings.html';
        this.response.body = {
            category,
            page_name: `home_${category}`,
            current: this.user,
            path,
        };
        if (category === 'preference') {
            this.response.body.settings = setting.PREFERENCE_SETTINGS;
        } else if (category === 'account') {
            this.response.body.settings = setting.ACCOUNT_SETTINGS;
        } else if (category === 'domain') {
            this.response.body.settings = setting.DOMAIN_USER_SETTINGS;
        } else throw new NotFoundError(category);
    }

    async post(args: any) {
        const $set = {};
        const booleanKeys = args.booleanKeys || {};
        delete args.booleanKeys;
        const setter = args.category === 'domain'
            ? (s) => domain.setUserInDomain(args.domainId, this.user._id, s)
            : (s) => user.setById(this.user._id, s);
        const settings = args.category === 'domain' ? setting.DOMAIN_USER_SETTINGS_BY_KEY : setting.SETTINGS_BY_KEY;
        for (const key in args) {
            const val = set(settings[key], key, args[key]);
            if (val !== undefined) $set[key] = val;
        }
        for (const key in booleanKeys) if (!args[key]) $set[key] = false;
        await setter($set);
        this.back();
    }
}

class UserChangemailWithCodeHandler extends Handler {
    @param('code', Types.String)
    async get(domainId: string, code: string) {
        const tdoc = await token.get(code, token.TYPE_CHANGEMAIL);
        if (!tdoc || tdoc.uid !== this.user._id) {
            throw new InvalidTokenError(code);
        }
        const udoc = await user.getByEmail(domainId, tdoc.email);
        if (udoc) throw new UserAlreadyExistError(tdoc.email);
        await Promise.all([
            user.setEmail(this.user._id, tdoc.email),
            token.del(code, token.TYPE_CHANGEMAIL),
        ]);
        this.response.redirect = this.url('home_security');
    }
}

class HomeDomainHandler extends Handler {
    async get() {
        const path = [
            ['Hydro', 'homepage'],
            ['home_domain', null],
        ];
        let ddocs: DomainDoc[] = [];
        let dudict: Record<string, DomainDoc> = {};
        if (!this.user.hasPriv(PRIV.PRIV_VIEW_ALL_DOMAIN)) {
            dudict = await domain.getDictUserByDomainId(this.user._id);
            const dids = Object.keys(dudict);
            ddocs = await domain.getMulti({ _id: { $in: dids } }).toArray();
        } else {
            const _ddocs = await domain.getMulti().toArray();
            for (const ddoc of _ddocs) {
                // eslint-disable-next-line no-await-in-loop
                const pcount = await ProblemModel.count(ddoc._id, {});
                if (pcount >= 3 || ddoc.owner === this.user._id) {
                    dudict[ddoc._id] = ddoc;
                    ddocs.push(ddoc);
                }
            }
        }
        const canManage = {};
        for (const ddoc of ddocs) {
            // eslint-disable-next-line no-await-in-loop
            const udoc = (await user.getById(ddoc._id, this.user._id))!;
            canManage[ddoc._id] = udoc.hasPerm(PERM.PERM_EDIT_DOMAIN)
                || udoc.hasPriv(PRIV.PRIV_MANAGE_ALL_DOMAIN);
        }
        this.response.template = 'home_domain.html';
        this.response.body = {
            ddocs, dudict, canManage, path,
        };
    }
}

class HomeDomainCreateHandler extends Handler {
    async get() {
        this.response.body = {
            path: [
                ['Hydro', 'homepage'],
                ['domain_create', null],
            ],
        };
        this.response.template = 'domain_create.html';
    }

    @param('id', Types.Name, isDomainId)
    @param('name', Types.Title)
    @param('bulletin', Types.Content)
    @param('avatar', Types.Content, true)
    // eslint-disable-next-line @typescript-eslint/no-shadow
    async post(_: string, id: string, name: string, bulletin: string, avatar: string) {
        const doc = await domain.get(id);
        if (doc) throw new DomainAlreadyExistsError(id);
        avatar = avatar || this.user.avatar || `gravatar:${this.user.mail}`;
        const domainId = await domain.add(id, this.user._id, name, bulletin);
        await domain.edit(domainId, { avatar });
        await domain.setUserRole(domainId, this.user._id, 'root');
        this.response.redirect = this.url('domain_dashboard', { domainId });
        this.response.body = { domainId };
    }
}

class HomeMessagesHandler extends Handler {
    async get() {
        // TODO(iceboy): projection, pagination.
        const messages = await message.getByUser(this.user._id);
        const uids = new Set<number>([
            ...messages.map((mdoc) => mdoc.from),
            ...messages.map((mdoc) => mdoc.to),
        ]);
        const udict = await user.getList('system', Array.from(uids));
        // TODO(twd2): improve here:
        const parsed = {};
        for (const m of messages) {
            const target = m.from === this.user._id ? m.to : m.from;
            if (!parsed[target]) {
                parsed[target] = {
                    _id: target,
                    udoc: { ...udict[target], avatarUrl: avatar(udict[target].avatar) },
                    messages: [],
                };
            }
            parsed[target].messages.push(m);
        }
        const path = [
            ['Hydro', 'homepage'],
            ['home_messages', null],
        ];
        await user.setById(this.user._id, { unreadMsg: 0 });
        this.response.body = { messages: parsed, path };
        this.response.template = 'home_messages.html';
    }

    @param('uid', Types.Int)
    @param('content', Types.Content)
    async postSend(domainId: string, uid: number, content: string) {
        this.checkPriv(PRIV.PRIV_SEND_MESSAGE);
        const udoc = await user.getById('system', uid);
        if (!udoc) throw new UserNotFoundError(uid);
        if (udoc.avatar) udoc.avatarUrl = avatar(udoc.avatar);
        const mdoc = await message.send(this.user._id, uid, content, message.FLAG_UNREAD);
        this.back({ mdoc, udoc });
    }

    @param('messageId', Types.ObjectID)
    async postDeleteMessage(domainId: string, messageId: ObjectID) {
        const msg = await message.get(messageId);
        if ([msg.from, msg.to].includes(this.user._id)) await message.del(messageId);
        else throw new PermissionError();
        this.back();
    }

    @param('messageId', Types.ObjectID)
    async postRead(domainId: string, messageId: ObjectID) {
        const msg = await message.get(messageId);
        if ([msg.from, msg.to].includes(this.user._id)) {
            await message.setFlag(messageId, message.FLAG_UNREAD);
        } else throw new PermissionError();
        this.back();
    }
}

class HomeMessagesConnectionHandler extends ConnectionHandler {
    dispose: bus.Disposable;

    async prepare() {
        this.dispose = bus.on('user/message', this.onMessageReceived.bind(this));
    }

    async onMessageReceived(uid: number, mdoc: MessageDoc) {
        if (uid !== this.user._id) return;
        const udoc = (await user.getById(this.domainId, mdoc.from))!;
        udoc.avatarUrl = avatar(udoc.avatar, 64);
        this.send({ udoc, mdoc });
    }

    async cleanup() {
        if (this.dispose) this.dispose();
    }
}

async function apply() {
    Route('homepage', '/', HomeHandler);
    Route('home_security', '/home/security', HomeSecurityHandler, PRIV.PRIV_USER_PROFILE);
    Route('user_changemail_with_code', '/home/changeMail/:code', UserChangemailWithCodeHandler, PRIV.PRIV_USER_PROFILE);
    Route('home_settings', '/home/settings/:category', HomeSettingsHandler, PRIV.PRIV_USER_PROFILE);
    Route('home_domain', '/home/domain', HomeDomainHandler, PRIV.PRIV_USER_PROFILE);
    Route('home_domain_create', '/home/domain/create', HomeDomainCreateHandler, PRIV.PRIV_CREATE_DOMAIN);
    if (system.get('server.message')) Route('home_messages', '/home/messages', HomeMessagesHandler, PRIV.PRIV_USER_PROFILE);
    Connection('home_messages_conn', '/home/messages-conn', HomeMessagesConnectionHandler, PRIV.PRIV_USER_PROFILE);
}

global.Hydro.handler.home = module.exports = apply;
