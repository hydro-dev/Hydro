const db = require('../service/db.js');

const coll = db.collection('task');

async function add(task) {
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
    const res = await coll.find(query).sort('_id', 1).limit(1).toArray();
    await coll.deleteOne({ _id: res[0]._id });
    return res[0];
}

module.exports = {
    add, get, del, count, getFirst,
};
