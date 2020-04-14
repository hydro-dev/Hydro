require('./utils');
const
    Mongo = require('mongodb'),
    { defaults } = require('lodash'),
    builtin = require('./model/builtin'),
    pwhash = require('./lib/pwhash'),
    options = require('./options'),
    { udoc } = require('./interface');

async function run() {
    let mongourl = 'mongodb://';
    if (options.db.username) mongourl += options.db.username + ':' + options.db.password + '@';
    mongourl += `${options.db.host}:${options.db.port}/${options.db.name}`;
    let Database = await Mongo.MongoClient.connect(mongourl, { useNewUrlParser: true, useUnifiedTopology: true });
    let db = Database.db(options.db.name);
    let coll_user = db.collection('user');
    let coll_role = db.collection('role');
    let coll_blacklist = db.collection('blacklist');
    let coll_token = db.collection('token');
    async function createUser() {
        let salt = pwhash.salt();
        await coll_user.insertMany([
            defaults({
                _id: 0,
                uname: 'Hydro',
                unameLower: 'hydro',
                mail: 'hydro@hydro',
                mailLower: 'hydro@hydro',
                role: 'guest'
            }, udoc),
            defaults({
                _id: 1,
                mail: 'guest@hydro',
                mailLower: 'guest@hydro',
                uname: 'Guest',
                unameLower: 'guest',
                role: 'guest'
            }, udoc),
            defaults({
                _id: -1,
                mail: 'root@hydro',
                mailLower: 'root@hydro',
                uname: 'Root',
                unameLower: 'root',
                hash: pwhash.hash('rootroot', salt),
                salt,
                gravatar: 'root@hydro',
                role: 'admin'
            }, udoc)
        ]);
    }
    await coll_user.createIndex('unameLower', { unique: true });
    await coll_user.createIndex('mailLower', { sparse: true });
    await coll_role.insertMany(builtin.BUILTIN_ROLES);
    await coll_user.insertMany(builtin.BUILTIN_USERS);
    await coll_blacklist.createIndex('expireAt', { expireAfterSeconds: 0 });
    await coll_token.createIndex([{ uid: 1 }, { tokenType: 1 }, { updateAt: -1 }], { sparse: true });
    await coll_token.createIndex('expireAt', { expireAfterSeconds: 0 });
    await createUser();
    console.log('Installed');
    process.exit(0);
}

run().catch(e => {
    console.error(e);
    process.exit(1);
});