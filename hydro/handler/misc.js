const { PRIV_JUDGE, PRIV_USER_PROFILE } = require('../model/builtin').PRIV;
const file = require('../model/file');
const user = require('../model/user');
const markdown = require('../lib/markdown');
const db = require('../service/db');
const { Route, Handler } = require('../service/server');

const coll = db.collection('status');

class FileDownloadHandler extends Handler {
    async get({ docId, secret, name }) {
        if (name) name = Buffer.from(name, 'base64').toString();
        this.response.attachment(name || docId);
        this.response.body = await file.get(docId, secret);
    }
}

class StatusHandler extends Handler {
    async get() {
        const stats = await coll.find().sort({ type: 1, updateAt: -1 }).toArray();
        for (const i in stats) {
            let desc = '';
            const online = new Date(stats[i].updateAt).getTime() > new Date().getTime() - 300000;
            if (!online) desc = 'Offline';
            desc = desc || 'Online';
            stats[i].isOnline = online;
            stats[i].status = desc;
        }
        const path = [
            ['Hydro', 'homepage'],
            ['status', null],
        ];
        this.response.body = { stats, path };
        this.response.template = 'status.html';
    }
}

class StatusUpdateHandler extends Handler {
    async post(args) {
        this.checkPerm(PRIV_JUDGE);
        args.type = 'judger';
        return coll.updateOne(
            { mid: args.mid, type: 'judger' },
            { $set: args },
            { upsert: true },
        );
    }
}

class SwitchLanguageHandler extends Handler {
    async get({ lang }) {
        if (this.user.hasPriv(PRIV_USER_PROFILE)) await user.setById(this.user._id, { viewLang: lang });
        else this.session.viewLang = lang;
        this.back();
    }
}

class MarkdownHandler extends Handler {
    async post({ text, safe = true }) {
        this.response.body = safe
            ? markdown.safe.render(text)
            : markdown.unsafe.render(text);
    }
}

async function apply() {
    Route('file_download', '/fs/:docId/:secret', FileDownloadHandler);
    Route('file_download_with_name', '/fs/:docId/:name/:secret', FileDownloadHandler);
    Route('status', '/status', StatusHandler);
    Route('status_update', '/status/update', StatusUpdateHandler);
    Route('switch_language', '/language/:lang', SwitchLanguageHandler);
    Route('markdown', '/markdown', MarkdownHandler);
}

apply.updateStatus = function updateStatus(args) {
    args.type = 'judger';
    return coll.updateOne(
        { mid: args.mid, type: 'judger' },
        { $set: args },
        { upsert: true },
    );
};

global.Hydro.handler.misc = module.exports = apply;
