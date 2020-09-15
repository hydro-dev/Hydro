import cluster from 'cluster';
import * as db from './db';
import * as bus from './bus';
import * as sysinfo from '../lib/sysinfo';

const coll = db.collection('status');

export async function update() {
    const [mid, $set] = await sysinfo.update();
    $set.updateAt = new Date();
    $set.reqCount = global.Hydro.stat.reqCount;
    await bus.serial('monitor/update', 'server', $set);
    await coll.updateOne(
        { mid, type: 'server' },
        { $set },
        { upsert: true },
    );
    global.Hydro.stat.reqCount = 0;
}

export async function updateJudger(args) {
    const $set = { ...args, updateAt: new Date() };
    await bus.serial('monitor/update', 'judger', $set);
    return await coll.updateOne(
        { mid: args.mid, type: 'judger' },
        { $set },
        { upsert: true },
    );
}

if (cluster.isMaster) {
    bus.on('app/started', async () => {
        const info = await sysinfo.get();
        await coll.updateOne(
            { mid: info.mid, type: 'server' },
            { $set: { ...info, updateAt: new Date(), type: 'server' } },
            { upsert: true },
        );
        setInterval(update, 60 * 1000);
    });
}

global.Hydro.service.monitor = { update, updateJudger };
