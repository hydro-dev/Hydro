import { PRIV } from '../model/builtin';
import * as DocumentModel from '../model/document';
import DomainModel from '../model/domain';
import RecordModel from '../model/record';
import UserModel from '../model/user';
import * as bus from '../service/bus';
import db from '../service/db';
import { Handler, Route } from '../service/server';

const coll = db.collection('status');

async function getStatus() {
    const stats = await coll.find().sort({ type: 1, updateAt: -1 }).toArray();
    for (const stat of stats) {
        let desc = '';
        const online = new Date(stat.updateAt).getTime() > new Date().getTime() - 300000;
        if (!online) desc = 'Offline';
        desc = desc || 'Online';
        stat.isOnline = online;
        stat.status = desc;
    }
    return stats;
}

class StatusHandler extends Handler {
    async get() {
        const stats = await getStatus();
        for (const stat of stats) {
            if (!stat.battery.hasBattery) stat.battery = 'No battery';
            else stat.battery = `${stat.battery.type} ${stat.battery.model} ${stat.battery.percent}%${stat.battery.isCharging ? ' Charging' : ''}`;
        }
        this.response.body = { stats };
        this.response.template = 'status.html';
    }
}

class AdminStatusHandler extends Handler {
    async get() {
        const record = await RecordModel.stat();
        const status = await getStatus();
        const [domainCount, userCount, problemCount, discussionCount, recordCount] = await Promise.all([
            DomainModel.getMulti().count(),
            UserModel.getMulti().count(),
            DocumentModel.coll.find({ docType: DocumentModel.TYPE_PROBLEM }).count(),
            DocumentModel.coll.find({ docType: DocumentModel.TYPE_DISCUSSION }).count(),
            RecordModel.coll.find().count(),
        ]);
        this.response.body = {
            record,
            status,
            domainCount,
            userCount,
            problemCount,
            discussionCount,
            recordCount,
        };
    }
}

class StatusUpdateHandler extends Handler {
    async post(args) {
        this.checkPriv(PRIV.PRIV_JUDGE);
        args.type = 'judge';
        args.updateAt = new Date();
        return coll.updateOne(
            { mid: args.mid, type: 'judge' },
            { $set: args },
            { upsert: true },
        );
    }
}

bus.once('app/started', () => coll.createIndex('updateAt', { expireAfterSeconds: 24 * 3600 }));

export async function apply() {
    Route('status', '/status', StatusHandler);
    Route('status_admin', '/.status', AdminStatusHandler);
    Route('status_update', '/status/update', StatusUpdateHandler);
}

global.Hydro.handler.status = apply;
