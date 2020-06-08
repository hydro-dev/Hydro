const db = require('./db');
const sysinfo = require('../lib/sysinfo');

const coll = db.collection('status');

async function update() {
    const [mid, $set] = await sysinfo.update();
    await coll.updateOne(
        { mid, type: 'server' },
        { $set: { ...$set, updateAt: new Date() } },
        { upsert: true },
    );
}

async function postInit() {
    const info = await sysinfo.get();
    await coll.updateOne(
        { mid: info.mid, type: 'server' },
        { $set: { ...info, updateAt: new Date(), type: 'server' } },
        { upsert: true },
    );
    setInterval(update, 3 * 60 * 1000);
}

global.Hydro.service.monitor = module.exports = { postInit };
