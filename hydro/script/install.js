const { defaults } = require('lodash');
const db = require('../service/db');
const builtin = require('../model/builtin');
const pwhash = require('../lib/pwhash');
const { udoc } = require('../interface');

const collUser = db.collection('user');
const collRole = db.collection('role');
const collSystem = db.collection('system');

async function run() {
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
            role: 'root',
        }, udoc),
    ]);
    await collRole.insertMany(builtin.BUILTIN_ROLES);
    console.log('Installed');
}

module.exports = { run };
