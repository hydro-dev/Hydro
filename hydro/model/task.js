const moment = require('moment-timezone');
const db = require('../service/db');

const coll = db.collection('task');

async function add(task) {
    const t = { ...task };
    if (typeof t.executeAfter === 'object') t.executeAfter = t.executeAfter.getTime();
    t.executeAfter = t.executeAfter || new Date().getTime();
    const res = await coll.insertOne(t);
    return res.insertedId;
}

function get(_id) {
    return coll.findOne({ _id });
}

function count(query) {
    return coll.find(query).count();
}

function del(_id) {
    return coll.deleteOne({ _id });
}

async function getFirst(query) {
    const q = { ...query };
    q.executeAfter = q.executeAfter || { $lt: new Date().getTime() };
    const res = await coll.find(q).sort('_id', 1).limit(1).toArray();
    if (res.length) {
        await coll.deleteOne({ _id: res[0]._id });
        if (res[0].interval) {
            await coll.insertOne({
                ...res[0], executeAfter: moment().add(...res[0].interval).toDate(),
            });
        }
        return res[0];
    }
    return null;
}

async function consume(query, cb) {
    let isRunning = false;
    const interval = setInterval(async () => {
        if (isRunning) return;
        isRunning = true;
        const res = await getFirst(query);
        if (res) {
            try {
                await cb(res);
            } catch (e) {
                clearInterval(interval);
            }
        }
        isRunning = false;
    }, 100);
}

global.Hydro.model.task = module.exports = {
    add, get, del, count, getFirst, consume,
};
