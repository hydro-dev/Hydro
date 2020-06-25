const moment = require('moment-timezone');
const db = require('../service/db');

const coll = db.collection('task');

async function add(task) {
    task.executeAfter = task.executeAfter || new Date();
    const res = await coll.insertOne(task);
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
    query.executeAfter = query.executeAfter || { $lte: new Date() };
    const res = await coll.find(query).sort('_id', 1).limit(1).toArray();
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
    setInterval(async () => {
        const res = await getFirst(query);
        if (res) cb(res);
    }, 100);
}

global.Hydro.model.task = module.exports = {
    add, get, del, count, getFirst, consume,
};
