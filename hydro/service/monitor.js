const db = require('./db');
const sysinfo = require('../lib/sysinfo');

const coll = db.collection('status');

async function update() {
    const [_id, $set] = await sysinfo.update();
    await coll.updateOne(
        { _id },
        { $set: { ...$set, updateAt: new Date() } },
        { upsert: true },
    );
}

async function postInit() {
    const info = await sysinfo.get();
    await coll.updateOne(
        { _id: info._id },
        { $set: { ...info, updateAt: new Date() } },
        { upsert: true },
    );
    setInterval(update, 3 * 60 * 1000);
}

global.Hydro.service.monitor = module.exports = { postInit };
