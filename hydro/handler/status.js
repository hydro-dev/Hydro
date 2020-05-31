const { PERM_JUDGE } = require('../permission');
const { Route, Handler } = require('../service/server');
const db = require('../service/db');

const coll = db.collection('status');

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
        this.response.body = { stats };
        this.response.template = 'status.html';
    }
}

class StatusUpdateHandler extends Handler {
    async post(args) {
        this.checkPerm(PERM_JUDGE);
        await coll.updateOne({ _id: args._id }, { $set: args }, { upsert: true });
    }
}

async function apply() {
    Route('/status', StatusHandler);
    Route('/status/update', StatusUpdateHandler);
}

global.Hydro.handler.status = module.exports = { StatusHandler, StatusUpdateHandler, apply };
