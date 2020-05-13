const { defaults } = require('lodash');
const db = require('../service/db');
const builtin = require('../model/builtin');
const system = require('../model/system');
const pwhash = require('../lib/pwhash');
const { udoc } = require('../interface');

const collUser = db.collection('user');
const collRole = db.collection('role');

async function run() {
    const def = {
        PROBLEM_PER_PAGE: 100,
        RECORD_PER_PAGE: 100,
        SOLUTION_PER_PAGE: 20,
        CONTEST_PER_PAGE: 20,
        TRAINING_PER_PAGE: 10,
        DISCUSSION_PER_PAGE: 50,
        REPLY_PER_PAGE: 50,
        CONTESTS_ON_MAIN: 5,
        TRAININGS_ON_MAIN: 5,
        DISCUSSIONS_ON_MAIN: 20,
        'smtp.host': '',
        'smtp.port': 465,
        'smtp.from': '',
        'smtp.user': '',
        'smtp.pass': '',
        'smtp.secure': false,
        'db.ver': 1,
        'listen.https': false,
        'listen.port': 8888,
        'session.keys': ['Hydro'],
        'session.secure': false,
        'session.saved_expire_seconds': 3600 * 24,
        'session.unsaved_expire_seconds': 600,
        changemail_token_expire_seconds: 3600 * 24,
        registration_token_expire_seconds: 600,
    };
    const tasks = [];
    for (const key in def) {
        tasks.push(system.set(key, def[key]));
    }
    await Promise.all(tasks);
    try {
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
    } catch (e) {
        // Ignore user already exist error
    }
    await collRole.deleteMany({ _id: { $in: builtin.BUILTIN_ROLES.map((role) => role._id) } });
    await collRole.insertMany(builtin.BUILTIN_ROLES);
}

module.exports = { run };
