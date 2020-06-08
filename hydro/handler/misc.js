
const { PERM_JUDGE } = require('../permission');
const file = require('../model/file');
const db = require('../service/db');
const { Route, Handler } = require('../service/server');

const coll = db.collection('status');

class FileDownloadHandler extends Handler {
    async get({ id, secret, name }) {
        if (name) name = Buffer.from(name, 'base64').toString();
        this.response.attachment(name || id);
        this.response.body = await file.get(id, secret);
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
            stats[i].status = desc;
        }
        console.log(stats);
        const path = [
            ['Hydro', '/'],
        ];
        this.response.body = { stats, path };
        this.response.template = 'status.html';
    }
}

class StatusUpdateHandler extends Handler {
    async post(args) {
        this.checkPerm(PERM_JUDGE);
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
        this.session.language = lang;
    }
}

async function apply() {
    Route('/fs/:id/:secret', FileDownloadHandler);
    Route('/fs/:id/:name/:secret', FileDownloadHandler);
    Route('/status', StatusHandler);
    Route('/status/update', StatusUpdateHandler);
    Route('/language/:lang', SwitchLanguageHandler);
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
