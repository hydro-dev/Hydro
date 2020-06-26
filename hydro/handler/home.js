const fs = require('fs');
const {
    VerifyPasswordError, UserAlreadyExistError, InvalidTokenError,
    NotFoundError,
} = require('../error');
const bus = require('../service/bus');
const {
    Route, Connection, Handler, ConnectionHandler,
} = require('../service/server');
const misc = require('../lib/misc');
const md5 = require('../lib/md5');
const contest = require('../model/contest');
const message = require('../model/message');
const document = require('../model/document');
const system = require('../model/system');
const user = require('../model/user');
const file = require('../model/file');
const setting = require('../model/setting');
const domain = require('../model/domain');
const discussion = require('../model/discussion');
const token = require('../model/token');
const training = require('../model/training');
const {
    PERM_VIEW_TRAINING, PERM_VIEW_CONTEST, PERM_VIEW_DISCUSSION,
    PERM_LOGGEDIN, PERM_VIEW_HOMEWORK,
} = require('../permission');

const { geoip, useragent } = global.Hydro.lib;

class HomeHandler extends Handler {
    async homework(domainId) {
        if (this.user.hasPerm(PERM_VIEW_HOMEWORK)) {
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
        if (this.user.hasPerm(PERM_VIEW_CONTEST)) {
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
        if (this.user.hasPerm(PERM_VIEW_TRAINING)) {
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

    async discussion(domainId) {
        if (this.user.hasPerm(PERM_VIEW_DISCUSSION)) {
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
    async prepare() {
        this.checkPerm(PERM_LOGGEDIN);
    }

    async get() {
        // TODO(iceboy): pagination? or limit session count for uid?
        const sessions = await token.getSessionListByUid(this.user._id);
        for (const session of sessions) {
            session.isCurrent = session._id === this.session._id;
            session._id = md5(session._id);
            if (useragent) session.updateUa = useragent.parse(session.updateUa || session.createUa || '');
            if (geoip) session.updateGeoip = geoip.lookup(session.updateIp || session.createIp);
        }
        this.response.template = 'home_security.html';
        this.response.body = { sessions, geoipProvider: (geoip || {}).provider };
        if (useragent) this.response.body.icon = useragent.icon;
    }

    async postChangePassword({ current, password, verifyPassword }) {
        if (password !== verifyPassword) throw new VerifyPasswordError();
        await user.changePassword(this.user._id, current, password);
        this.back();
    }

    async postChangeMail({ currentPassword, mail }) {
        this.limitRate('send_mail', 3600, 30);
        this.user.checkPassword(currentPassword);
        const udoc = await user.getByMail(mail);
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
    async prepare() {
        this.checkPerm(PERM_LOGGEDIN);
    }

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
            if (setting.SETTINGS_BY_KEY[key]) {
                $set[key] = args[key];
            }
        }
        await user.setById(this.user._id, $set);
        this.back();
    }
}

class UserChangemailWithCodeHandler extends Handler {
    async get({ code }) {
        const tdoc = await token.get(code, token.TYPE_CHANGEMAIL);
        if (!tdoc || tdoc.uid !== this.user._id) {
            throw new InvalidTokenError(code);
        }
        const udoc = await user.getByEmail(tdoc.mail);
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
        await message.delete(messageId, this.user._id);
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

// TODO draft
class HomeFileHandler extends Handler {
    async get() {
        const ufdocs = await file.getMulti({ owner: this.user._id }).toArray();
        const fdict = await fs.getMetaDict(ufdocs.map((ufdoc) => ufdoc._id));
        this.response.template = 'home_file.html';
        this.response.body = { ufdocs, fdict };
    }

    async postDelete(ufid) {
        const ufdoc = await file.get(ufid);
        if (ufdoc.owner !== this.user._id) this.checkPriv(PRIV_DELETE_FILE);
        const result = await file.del(ufdoc._id);
        if (result) await file.decUsage(this.user._id, ufdoc.length);
        this.back();
    }
}

async function apply() {
    Route('homepage', '/', HomeHandler);
    Route('home_security', '/home/security', HomeSecurityHandler, PERM_LOGGEDIN);
    Route('user_changemail_with_code', '/home/changeMail/:code', UserChangemailWithCodeHandler, PERM_LOGGEDIN);
    Route('home_settings', '/home/settings/:category', HomeSettingsHandler, PERM_LOGGEDIN);
    Route('home_messages', '/home/messages', HomeMessagesHandler, PERM_LOGGEDIN);
    Connection('home_messages_conn', '/home/messages-conn', HomeMessagesConnectionHandler);
}

global.Hydro.handler.home = module.exports = apply;
