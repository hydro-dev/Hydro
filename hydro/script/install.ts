import { PRIV } from '../model/builtin';
import * as system from '../model/system';
import * as user from '../model/user';
import * as domain from '../model/domain';
import pwhash from '../lib/hash.hydro';

export const description = 'Install';

export async function run({ username = '', password = '' } = {}) {
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
    const tasks = [];
    for (const key in def) {
        tasks.push(system.get(key).then((value) => {
            if (!value) return system.set(key, def[key]);
            return Promise.resolve();
        }));
    }
    await Promise.all(tasks);
    await domain.add('system', 0, 'Hydro', true);
    if (username && password) {
        const udoc = await user.getById('system', -1);
        if (!udoc) {
            await user.create({
                uid: -1,
                mail: 'root@hydro.local',
                uname: username,
                password,
                regip: '127.0.0.1',
                priv: PRIV.PRIV_ALL,
            });
        } else {
            const salt = String.random();
            await user.setById(-1, {
                uname: username,
                unameLower: username.trim().toLowerCase(),
                salt,
                hash: pwhash(password, salt),
                hashType: 'hydro',
            });
        }
    }
}

export const validate = {
    $or: [
        { username: 'string', password: 'string' },
        { username: 'undefined', password: 'undefined' },
    ],
};

global.Hydro.script.install = { run, description, validate };
