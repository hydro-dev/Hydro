import { ObjectID } from 'mongodb';
import {
    VerifyPasswordError, UserAlreadyExistError, InvalidTokenError,
    NotFoundError, UserNotFoundError, PermissionError,
} from '../error';
import * as bus from '../service/bus';
import {
    Route, Connection, Handler, ConnectionHandler, param, Types,
} from '../service/server';
import * as misc from '../lib/misc';
import md5 from '../lib/md5';
import * as mail from '../lib/mail';
import * as contest from '../model/contest';
import * as message from '../model/message';
import * as document from '../model/document';
import * as system from '../model/system';
import * as user from '../model/user';
import * as file from '../model/file';
import * as setting from '../model/setting';
import * as domain from '../model/domain';
import * as discussion from '../model/discussion';
import * as token from '../model/token';
import * as training from '../model/training';
import { PERM, PRIV } from '../model/builtin';
import {
    isContent, isPassword, isEmail, isTitle,
} from '../lib/validator';

const { geoip, useragent } = global.Hydro.lib;

class HomeHandler extends Handler {
    async homework(domainId: string) {
        if (this.user.hasPerm(PERM.PERM_VIEW_HOMEWORK)) {
            const tdocs = await contest.getMulti(domainId, {}, document.TYPE_HOMEWORK)
                .sort('beginAt', -1)
                .limit(await system.get('HOMEWORK_ON_MAIN'))
                .toArray();
            const tsdict = await contest.getListStatus(
                domainId, this.user._id,
                tdocs.map((tdoc) => tdoc.docId), document.TYPE_HOMEWORK,
            );
            return [tdocs, tsdict];
        }
        return [[], {}];
    }

    async contest(domainId: string) {
        if (this.user.hasPerm(PERM.PERM_VIEW_CONTEST)) {
            const tdocs = await contest.getMulti(domainId)
                .sort('beginAt', -1)
                .limit(await system.get('CONTEST_ON_MAIN'))
                .toArray();
            const tsdict = await contest.getListStatus(
                domainId, this.user._id, tdocs.map((tdoc) => tdoc.docId),
            );
            return [tdocs, tsdict];
        }
        return [[], {}];
    }

    async training(domainId: string) {
        if (this.user.hasPerm(PERM.PERM_VIEW_TRAINING)) {
            const tdocs = await training.getMulti(domainId)
                .sort('_id', 1)
                .limit(await system.get('TRAINING_ON_MAIN'))
                .toArray();
            const tsdict = await training.getListStatus(
                domainId, this.user._id, tdocs.map((tdoc) => tdoc.docId),
            );
            return [tdocs, tsdict];
        }
        return [[], {}];
    }

    async discussion(domainId: string): Promise<[any[], any]> {
        if (this.user.hasPerm(PERM.PERM_VIEW_DISCUSSION)) {
            const ddocs = await discussion.getMulti(domainId)
                .limit(await system.get('DISCUSSION_ON_MAIN'))
                .toArray();
            const vndict = await discussion.getListVnodes(domainId, ddocs, this);
            return [ddocs, vndict];
        }
        return [[], {}];
    }

    async get({ domainId }) {
        const [
            [htdocs, htsdict], [tdocs, tsdict],
            [trdocs, trsdict], [ddocs, vndict],
        ] = await Promise.all([
            this.homework(domainId), this.contest(domainId),
            this.training(domainId), this.discussion(domainId),
        ]);
        const [udict, dodoc, vnodes] = await Promise.all([
            user.getList(domainId, ddocs.map((ddoc) => ddoc.owner)),
            domain.get(domainId),
            discussion.getNodes(domainId),
        ]);
        this.response.template = 'main.html';
        this.response.body = {
            htdocs,
            htsdict,
            tdocs,
            tsdict,
            trdocs,
            trsdict,
            ddocs,
            vndict,
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

    @param('currentPassword', Types.String)
    @param('mail', Types.String, isEmail)
    async postChangeMail(domainId: string, current: string, email: string) {
        this.limitRate('send_mail', 3600, 30);
        this.user.checkPassword(current);
        const udoc = await user.getByEmail(domainId, email);
        if (udoc) throw new UserAlreadyExistError(email);
        const [code] = await token.add(
            token.TYPE_CHANGEMAIL,
            await system.get('changemail_token_expire_seconds'),
            { uid: this.user._id, email },
        );
        const m = await this.renderHTML('user_changemail_mail.html', {
            path: `home/changeMail/${code}`,
            uname: this.user.uname,
            url_prefix: await system.get('server.url'),
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

class HomeSettingsHandler extends Handler {
    @param('category', Types.String)
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
        } else throw new NotFoundError();
    }

    async post(args: any) {
        const $set = {};
        if (args.category === 'domain') {
            for (const key in args) {
                if (setting.DOMAIN_USER_SETTINGS_BY_KEY[key]
                    && !(setting.DOMAIN_USER_SETTINGS_BY_KEY[key].flag & setting.FLAG_DISABLED)) {
                    $set[key] = args[key];
                }
            }
            await domain.setUserInDomain(args.domainId, this.user._id, $set);
        } else {
            for (const key in args) {
                if (setting.SETTINGS_BY_KEY[key]
                    && !(setting.SETTINGS_BY_KEY[key].flag & setting.FLAG_DISABLED)) {
                    $set[key] = args[key];
                }
            }
            await user.setById(this.user._id, $set);
        }
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
        const dudict = await domain.getDictUserByDomainId(this.user._id);
        const dids = Object.keys(dudict);
        const ddocs = await domain.getMulti({ _id: { $in: dids } }).toArray();
        const canManage = {};
        for (const ddoc of ddocs) {
            // eslint-disable-next-line no-await-in-loop
            const udoc = await user.getById(ddoc._id, this.user._id);
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

    @param('id', Types.String)
    @param('name', Types.String, isTitle)
    @param('bulletin', Types.String, isContent)
    @param('gravatar', Types.String, true, isEmail)
    async post(_: string, id: string, name: string, bulletin: string, gravatar: string) {
        gravatar = gravatar || this.user.gravatar || this.user.mail || 'guest@hydro.local';
        const domainId = await domain.add(id, this.user._id, name, bulletin);
        await domain.edit(domainId, { gravatar });
        this.response.redirect = this.url('domain_manage', { domainId });
        this.response.body = { domainId };
    }
}

class HomeMessagesHandler extends Handler {
    async get() {
        // TODO(iceboy): projection, pagination.
        const messages = await message.getByUser(this.user._id);
        const udict = await user.getList('system', [
            ...messages.map((mdoc) => mdoc.from),
            ...messages.map((mdoc) => mdoc.to),
        ]);
        // TODO(twd2): improve here:
        const parsed = {};
        for (const m of messages) {
            const target = m.from === this.user._id ? m.to : m.from;
            if (!parsed[target]) {
                parsed[target] = {
                    _id: target,
                    udoc: { ...udict[target], gravatar: misc.gravatar(udict[target].gravatar) },
                    messages: [],
                };
            }
            parsed[target].messages.push(m);
        }
        const path = [
            ['Hydro', 'homepage'],
            ['home_messages', null],
        ];
        this.response.body = { messages: parsed, path };
        this.response.template = 'home_messages.html';
    }

    @param('uid', Types.Int)
    @param('content', Types.String, isContent)
    async postSend(domainId: string, uid: number, content: string) {
        const udoc = await user.getById('system', uid);
        if (!udoc) throw new UserNotFoundError(uid);
        if (udoc.gravatar) udoc.gravatar = misc.gravatar(udoc.gravatar);
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
    id: string;

    async prepare() {
        bus.subscribe([`user_message-${this.user._id}`], this.onMessageReceived.bind(this));
    }

    async onMessageReceived(e: any) {
        this.send(e.value);
    }

    async cleanup() {
        bus.unsubscribe([`user_message-${this.user._id}`], this.id);
    }
}

class HomeFileHandler extends Handler {
    async get() {
        const path = [
            ['Hydro', 'homepage'],
            ['domain_file', null],
        ];
        const ufdocs = await file.getMulti({ owner: this.user._id }).toArray();
        this.response.template = 'home_file.html';
        this.response.body = { ufdocs, path };
    }

    @param('ufid', Types.ObjectID)
    async postDelete(domainId: string, ufid: ObjectID) {
        const ufdoc = await file.getMeta(ufid);
        if (ufdoc.owner !== this.user._id) this.checkPriv(PRIV.PRIV_DELETE_FILE);
        else this.checkPriv(PRIV.PRIV_DELETE_FILE_SELF);
        const result = await file.del(ufdoc._id);
        if (result) await user.inc(this.user._id, 'usage', -ufdoc.size);
        this.back();
    }
}

async function apply() {
    Route('homepage', '/', HomeHandler);
    Route('home_security', '/home/security', HomeSecurityHandler, PRIV.PRIV_USER_PROFILE);
    Route('user_changemail_with_code', '/home/changeMail/:code', UserChangemailWithCodeHandler, PRIV.PRIV_USER_PROFILE);
    Route('home_settings', '/home/settings/:category', HomeSettingsHandler, PRIV.PRIV_USER_PROFILE);
    Route('home_domain', '/home/domain', HomeDomainHandler, PRIV.PRIV_USER_PROFILE);
    Route('home_domain_create', '/home/domain/create', HomeDomainCreateHandler, PRIV.PRIV_CREATE_DOMAIN);
    Route('home_messages', '/home/messages', HomeMessagesHandler, PRIV.PRIV_USER_PROFILE);
    Route('home_file', '/home/file', HomeFileHandler, PRIV.PRIV_USER_PROFILE);
    Connection('home_messages_conn', '/home/messages-conn', HomeMessagesConnectionHandler, PRIV.PRIV_USER_PROFILE);
}

global.Hydro.handler.home = module.exports = apply;
