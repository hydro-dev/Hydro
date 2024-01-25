import { Context } from '../context';
import { PRIV } from '../model/builtin';
import * as DocumentModel from '../model/document';
import DomainModel from '../model/domain';
import RecordModel from '../model/record';
import UserModel from '../model/user';
import db from '../service/db';
import { Handler } from '../service/server';

const coll = db.collection('status');

async function getStatus() {
    const stats = await coll.find().sort({ type: 1, updateAt: -1 }).toArray();
    for (const stat of stats) {
        let desc = '';
        const online = new Date(stat.updateAt).getTime() > new Date().getTime() - 300000;
        if (!online) desc = 'Offline';
        desc ||= 'Online';
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
            DomainModel.coll.count(),
            UserModel.coll.count(),
            DocumentModel.coll.count({ docType: DocumentModel.TYPE_PROBLEM }),
            DocumentModel.coll.count({ docType: DocumentModel.TYPE_DISCUSSION }),
            RecordModel.coll.count(),
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

export async function apply(ctx: Context) {
    ctx.Route('status', '/status', StatusHandler);
    ctx.Route('status_admin', '/.status', AdminStatusHandler);
    ctx.Route('status_update', '/status/update', StatusUpdateHandler);
    await db.ensureIndexes(coll, { name: 'expire', key: { updateAt: 1 }, expireAfterSeconds: 24 * 2600 });
}
