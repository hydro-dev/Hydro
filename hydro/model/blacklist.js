const
    db = require('../service/db.js'),
    coll = db.collection('blacklist');

async function add(ip) {
    let expireAt = new Date(new Date().getTime() + 365 * 24 * 60 * 60 * 1000);
    return coll.findOneAndUpdate({ _id: ip }, { $set: { expireAt } }, { upsert: true });
}
function get(ip) {
    return coll.findOne({ _id: ip });
}
function del(ip) {
    return coll.deleteOne({ _id: ip });
}

module.exports = { add, get, del };
