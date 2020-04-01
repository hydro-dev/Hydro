const
    db = require('../service/db.js'),
    coll = db.collection('blacklist');

module.exports = {
    add(ip) {
        let expireAt = new Date(new Date().getTime() + 365 * 24 * 60 * 60 * 1000);
        return coll.findOneAndUpdate({ _id: ip }, { $set: { expireAt } }, { upsert: true });
    },
    get: ip => coll.findOne({ _id: ip }),
    delete: ip => coll.deleteOne({ _id: ip })
};