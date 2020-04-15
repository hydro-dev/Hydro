const Mongo = require('mongodb');
const options = require('../options');

let mongourl = 'mongodb://';
if (options.db.username) mongourl += `${options.db.username}:${options.db.password}@`;
mongourl += `${options.db.host}:${options.db.port}/${options.db.name}`;
/**
 * @type {import('mongodb').Db}
 */
let db = null;
Mongo.MongoClient.connect(mongourl, { useNewUrlParser: true, useUnifiedTopology: true })
    .then((Database) => {
        db = Database.db(options.db.name);
        db.Db = Database;
        global.bus.emit('connected');
    });

module.exports = {
    collection: (c) => db.collection(c),
};
