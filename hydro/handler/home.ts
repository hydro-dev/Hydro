import fs from 'fs';
import {
    VerifyPasswordError, UserAlreadyExistError, InvalidTokenError,
    NotFoundError,
} from '../error';
import * as bus from '../service/bus';
import {
    Route, Connection, Handler, ConnectionHandler,
} from '../service/server';
import * as misc from '../lib/misc';
import md5 from '../lib/md5';
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

const { geoip, useragent } = global.Hydro.lib;

class HomeHandler extends Handler {
    async homework(domainId) {
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

    async contest(domainId) {
        if (this.user.hasPerm(PERM.PERM_VIEW_CONTEST)) {
            const tdocs = await contest.getMulti(domainId)
                .sort('beginAt', -1)
                .limit(await system.get('CONTESTS_ON_MAIN'))
                .toArray();
            const tsdict = await contest.getListStatus(
                domainId, this.user._id, tdocs.map((tdoc) => tdoc.docId),
            );
            return [tdocs, tsdict];
        }
        return [[], {}];
    }

    async training(domainId) {
        if (this.user.hasPerm(PERM.PERM_VIEW_TRAINING)) {
            const tdocs = await training.getMulti(domainId)
                .sort('_id', 1)
                .limit(await system.get('TRAININGS_ON_MAIN'))
                .toArray();
            const tsdict = await training.getListStatus(
                domainId, this.user._id, tdocs.map((tdoc) => tdoc.docId),
            );
            return [tdocs, tsdict];
        }
        return [[], {}];
    }

    async discussion(domainId): Promise<[any[], any]> {
        if (this.user.hasPerm(PERM.PERM_VIEW_DISCUSSION)) {
            const ddocs = await discussion.getMulti(domainId)
                .limit(await system.get('DISCUSSIONS_ON_MAIN'))
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
        this.response.body = { sessions, geoipProvider: (geoip || {}).provider, path };
        if (useragent) this.response.body.icon = useragent.icon;
    }

    async postChangePassword({ current, password, verifyPassword }) {
        if (password !== verifyPassword) throw new VerifyPasswordError();
        await user.changePassword(this.user._id, current, password);
        this.back();
    }

    async postChangeMail({ domainId, currentPassword, mail }) {
        this.limitRate('send_mail', 3600, 30);
        this.user.checkPassword(currentPassword);
        const udoc = await user.getByEmail(domainId, mail, true);
        if (udoc) throw new UserAlreadyExistError(mail);
        const [code] = await token.add(
            token.TYPE_CHANGEMAIL,
            await system.get('changemail_token_expire_seconds'),
            { uid: this.udoc._id, mail },
        );
        await mail.sendMail(mail, 'Change Email', 'user_changemail_mail.html', {
            url: this.url('user_changemail_with_code', { code }), uname: this.udoc.uname,
        });
        this.response.template = 'user_changemail_mail_sent.html';
    }

    async postDeleteToken({ tokenDigest }) {
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
    async get({ category }) {
        // eslint-disable-next-line prefer-destructuring
        category = category[0]; // Category would be splitted into array
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
        } else throw new NotFoundError();
    }

    async post(args) {
        const $set = {};
        for (const key in args) {
            if (setting.SETTINGS_BY_KEY[key] && !setting.SETTINGS_BY_KEY[key].disabled) {
                $set[key] = args[key];
            }
        }
        await user.setById(this.user._id, $set);
        this.back();
    }
}

class UserChangemailWithCodeHandler extends Handler {
    async get({ domainId, code }) {
        const tdoc = await token.get(code, token.TYPE_CHANGEMAIL);
        if (!tdoc || tdoc.uid !== this.user._id) {
            throw new InvalidTokenError(code);
        }
        const udoc = await user.getByEmail(domainId, tdoc.mail, true);
        if (udoc) throw new UserAlreadyExistError(tdoc.mail);
        await Promise.all([
            user.setEmail(this.user._id, tdoc.mail),
            token.del(code, token.TYPE_CHANGEMAIL),
        ]);
        this.response.redirect = this.url('home_security');
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

    async postSend({ uid, content }) {
        const udoc = await user.getById('system', uid);
        const mdoc = await message.send(this.user._id, uid, content);
        // TODO(twd2): improve here: projection
        if (this.user._id !== uid) {
            await bus.publish(`user_message-${uid}`, { mdoc, udoc });
        }
        this.back({ mdoc, udoc });
    }

    async postDeleteMessage({ messageId }) {
        await message.del(messageId);
        this.back();
    }
}

class HomeMessagesConnectionHandler extends ConnectionHandler {
    async prepare() {
        bus.subscribe([`user_message-${this.user._id}`], this, 'onMessageReceived');
    }

    async onMessageReceived(e) {
        this.send(e.value);
    }

    async cleanup() {
        bus.unsubscribe([`user_message-${this.user._id}`], this, 'onMessageReceived');
    }
}

class HomeFileHandler extends Handler {
    async get() {
        const ufdocs = await file.getMulti({ owner: this.user._id }).toArray();
        const fdict = await file.getMetaDict(ufdocs.map((ufdoc) => ufdoc._id));
        this.response.template = 'home_file.html';
        this.response.body = { ufdocs, fdict };
    }

    async postDelete(ufid) {
        const ufdoc = await file.getMeta(ufid);
        if (ufdoc.owner !== this.user._id) this.checkPriv(PRIV.PRIV_DELETE_FILE);
        else this.checkPriv(PRIV.PRIV_DELETE_FILE_SELF);
        const result = await file.del(ufdoc._id);
        if (result) await user.inc(this.user._id, 'usage', ufdoc.length);
        this.back();
    }
}

async function apply() {
    Route('homepage', '/', HomeHandler);
    Route('home_security', '/home/security', HomeSecurityHandler, PRIV.PRIV_USER_PROFILE);
    Route('user_changemail_with_code', '/home/changeMail/:code', UserChangemailWithCodeHandler, PRIV.PRIV_USER_PROFILE);
    Route('home_settings', '/home/settings/:category', HomeSettingsHandler, PRIV.PRIV_USER_PROFILE);
    Route('home_messages', '/home/messages', HomeMessagesHandler, PRIV.PRIV_USER_PROFILE);
    Route('home_file', '/home/file', HomeFileHandler, PRIV.PRIV_USER_PROFILE);
    Connection('home_messages_conn', '/home/messages-conn', HomeMessagesConnectionHandler, PRIV.PRIV_USER_PROFILE);
}

global.Hydro.handler.home = module.exports = apply;
