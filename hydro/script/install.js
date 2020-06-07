const { defaults } = require('lodash');
const db = require('../service/db');
const builtin = require('../model/builtin');
const discussion = require('../model/discussion');
const system = require('../model/system');
const domain = require('../model/domain');
const pwhash = require('../lib/hash.hydro');
const { udoc } = require('../interface');

const collUser = db.collection('user');

const allowFail = async (func, ...args) => {
    let res;
    try {
        res = await func(...args);
    } catch (e) {
        return null;
    }
    return res;
};

async function run({ username, password } = {}) {
    const def = {
        PROBLEM_PER_PAGE: 100,
        RECORD_PER_PAGE: 100,
        SOLUTION_PER_PAGE: 20,
        CONTEST_PER_PAGE: 20,
        TRAINING_PER_PAGE: 10,
        DISCUSSION_PER_PAGE: 50,
        REPLY_PER_PAGE: 50,
        HOMEWORK_ON_MAIN: 5,
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
        'server.port': 8888,
        'session.keys': ['Hydro'],
        'session.secure': false,
        'session.saved_expire_seconds': 3600 * 24,
        'session.unsaved_expire_seconds': 600,
        changemail_token_expire_seconds: 3600 * 24,
        registration_token_expire_seconds: 600,
    };
    let tasks = [];
    for (const key in def) {
        tasks.push(system.get(key).then((value) => {
            if (!value) return system.set(key, def[key]);
            return Promise.resolve();
        }));
    }
    await Promise.all(tasks);
    tasks = [
        allowFail(domain.add, 'system', 0),
        collUser.updateOne({ _id: 0 }, {
            $set: defaults({
                _id: 0,
                uname: 'Hydro',
                unameLower: 'hydro',
                mail: 'hydro@hydro',
                mailLower: 'hydro@hydro',
            }, udoc),
        }, { upsert: true }),
        collUser.updateOne({ _id: 1 }, {
            $set: defaults({
                _id: 1,
                mail: 'guest@hydro',
                mailLower: 'guest@hydro',
                uname: 'Guest',
                unameLower: 'guest',
            }, udoc),
        }, { upsert: true }),
    ];
    if (username && password) {
        const salt = String.random();
        tasks.push(
            collUser.updateOne({ _id: -1 }, {
                $set: defaults({
                    _id: -1,
                    mail: 'root@hydro',
                    mailLower: 'root@hydro',
                    uname: username,
                    unameLower: username.trim().toLowerCase(),
                    hash: pwhash.hash(password, salt),
                    salt,
                    gravatar: 'root@hydro',
                    priv: 1,
                }, udoc),
            }, { upsert: true }),
        );
    }
    await Promise.all(tasks);
}

global.Hydro.script.install = module.exports = { run };
