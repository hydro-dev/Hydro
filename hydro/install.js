require('./utils');
const Mongo = require('mongodb');
const { defaults } = require('lodash');
const builtin = require('./model/builtin');
const pwhash = require('./lib/pwhash');
const options = require('./options');
const { udoc } = require('./interface');

async function run() {
    let mongourl = 'mongodb://';
    if (options.db.username) mongourl += `${options.db.username}:${options.db.password}@`;
    mongourl += `${options.db.host}:${options.db.port}/${options.db.name}`;
    const Database = await Mongo.MongoClient.connect(mongourl, { useNewUrlParser: true, useUnifiedTopology: true });
    const db = Database.db(options.db.name);
    const collUser = db.collection('user');
    const collRole = db.collection('role');
    const collBlacklist = db.collection('blacklist');
    const collToken = db.collection('token');
    async function createUser() {
        const salt = pwhash.salt();
        await collUser.insertMany([
            defaults({
                _id: 0,
                uname: 'Hydro',
                unameLower: 'hydro',
                mail: 'hydro@hydro',
                mailLower: 'hydro@hydro',
                role: 'guest',
            }, udoc),
            defaults({
                _id: 1,
                mail: 'guest@hydro',
                mailLower: 'guest@hydro',
                uname: 'Guest',
                unameLower: 'guest',
                role: 'guest',
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
                role: 'admin',
            }, udoc),
        ]);
    }
    await collUser.createIndex('unameLower', { unique: true });
    await collUser.createIndex('mailLower', { sparse: true });
    await collRole.insertMany(builtin.BUILTIN_ROLES);
    await collBlacklist.createIndex('expireAt', { expireAfterSeconds: 0 });
    await collToken.createIndex([{ uid: 1 }, { tokenType: 1 }, { updateAt: -1 }], { sparse: true });
    await collToken.createIndex('expireAt', { expireAfterSeconds: 0 });
    await createUser();
    console.log('Installed');
    process.exit(0);
}

run().catch((e) => {
    console.error(e);
    process.exit(1);
});
