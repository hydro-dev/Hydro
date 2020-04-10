const
    Mongo = require('mongodb'),
    builtin = require('./model/builtin'),
    pwhash = require('./lib/pwhash'),
    options = require('./options');

async function run() {
    let mongourl = 'mongodb://';
    if (options.db.username) mongourl += options.db.username + ':' + options.db.password + '@';
    mongourl += `${options.db.host}:${options.db.port}/${options.db.name}`;
    let Database = await Mongo.MongoClient.connect(mongourl, { useNewUrlParser: true, useUnifiedTopology: true });
    let db = Database.db(options.db.name);
    let coll_user = db.collection('user');
    let coll_role = db.collection('role');
    let coll_blacklist = db.collection('blacklist');
    async function createRootUser() {
        let salt = pwhash.salt();
        await coll_user.insertOne({
            _id: -1,
            email: 'root@hydro',
            emailLower: 'root@hydro',
            uname: 'Root',
            unameLower: 'root',
            password: pwhash.hash('root', salt),
            salt,
            regat: new Date(),
            regip: '127.0.0.1',
            loginat: new Date(),
            loginip: '127.0.0.1',
            gravatar: 'root@hydro',
            role: 'admin'
        });
    }
    await coll_user.createIndex('unameLower', { unique: true });
    await coll_user.createIndex('emailLower', { sparse: true });
    await coll_role.insertMany(builtin.BUILTIN_ROLES);
    await coll_user.insertMany(builtin.BUILTIN_USERS);
    await coll_blacklist.createIndex('expireAt', { expireAfterSeconds: 0 });
    await createRootUser();
    console.log('Installed');
    process.exit(0);
}

run().catch(e => {
    console.error(e);
    process.exit(1);
});