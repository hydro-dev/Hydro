import { Context } from '../context';
import { PRIV } from '../model/builtin';
import * as SettingModel from '../model/setting';
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
        const compilers = {};
        const warn = {};
        const result: Array<{ key: string[], message: string }> = [];
        // For each language, select the most common compiler message version,
        // then merge languages with the same message.
        for (const stat of stats) {
            if (!stat.battery?.hasBattery) stat.battery = 'No battery';
            else stat.battery = `${stat.battery.type} ${stat.battery.model} ${stat.battery.percent}%${stat.battery.isCharging ? ' Charging' : ''}`;
            if (stat.compilers) {
                for (const key in stat.compilers) {
                    if (!compilers[key]) compilers[key] ||= [];
                    const related = compilers[key].find((i) => i.message === stat.compilers[key]);
                    if (related) related.related.push(stat._id);
                    else {
                        compilers[key].push({
                            related: [stat._id],
                            message: stat.compilers[key],
                        });
                    }
                }
            }
        }
        for (const key in compilers) {
            compilers[key].sort((a, b) => b.related.length - a.related.length);
            const message = compilers[key][0].message;
            for (let i = 1; i < compilers[key].length; i++) {
                for (const id of compilers[key][i].related) {
                    warn[id] = true;
                }
            }
            const t = result.find((i) => i.message === message);
            if (t) t.key.push(key);
            else result.push({ key: [key], message });
        }
        const LANGS = SettingModel.langs;
        const languages = {};
        for (const key in LANGS) {
            if (LANGS[key].hidden) continue;
            languages[`${LANGS[key].display}(${key})`] = LANGS[key].compile || LANGS[key].execute;
        }
        this.response.body = { stats, languages, compilers: result };
        this.response.template = 'status.html';
    }
}

class StatusUpdateHandler extends Handler {
    async post(args) {
        this.checkPriv(PRIV.PRIV_JUDGE);
        args.type = 'judge';
        args.updateAt = new Date();
        await coll.updateOne(
            { mid: args.mid, type: 'judge' },
            { $set: args },
            { upsert: true },
        );
        this.response.body = { ok: 1 };
    }
}

export async function apply(ctx: Context) {
    ctx.Route('status', '/status', StatusHandler);
    ctx.Route('status_update', '/status/update', StatusUpdateHandler);
    await db.ensureIndexes(coll, { name: 'expire', key: { updateAt: 1 }, expireAfterSeconds: 24 * 2600 });
}
