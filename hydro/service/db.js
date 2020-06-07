const Mongo = require('mongodb');
const bus = require('./bus');
const options = require('../options');

let mongourl = 'mongodb://';
if (options.username) mongourl += `${options.username}:${options.password}@`;
mongourl += `${options.host}:${options.port}/${options.name}`;
/**
 * @type {import('mongodb').Db}
 */
let db = null;
Mongo.MongoClient.connect(mongourl, { useNewUrlParser: true, useUnifiedTopology: true })
    .then((Client) => {
        db = Client.db(options.name);
        db.Client = Client;
        bus.publish('system_database_connected', null);
    });

global.Hydro.service.db = module.exports = {
    collection: (c) => db.collection(c),
    dropDatabase: () => db.dropDatabase(),
};
