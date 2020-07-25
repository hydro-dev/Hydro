import * as db from './db';
import * as sysinfo from '../lib/sysinfo';

const coll = db.collection('status');

export async function update() {
    const [mid, $set] = await sysinfo.update();
    await coll.updateOne(
        { mid, type: 'server' },
        { $set: { ...$set, updateAt: new Date(), reqCount: global.Hydro.stat.reqCount } },
        { upsert: true },
    );
    global.Hydro.stat.reqCount = 0;
}

export function updateJudger(args) {
    args.type = 'judger';
    return coll.updateOne(
        { mid: args.mid, type: 'judger' },
        { $set: args },
        { upsert: true },
    );
}

global.Hydro.postInit.push(
    async () => {
        const info = await sysinfo.get();
        await coll.updateOne(
            { mid: info.mid, type: 'server' },
            { $set: { ...info, updateAt: new Date(), type: 'server' } },
            { upsert: true },
        );
        setInterval(update, 60 * 1000);
    },
);

global.Hydro.service.monitor = { update, updateJudger };
