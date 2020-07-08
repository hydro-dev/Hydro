import * as user from '../model/user';
import * as system from '../model/system';

export const description = 'Create a new user';

export async function run({
    uname, password, mail, uid,
}) {
    if (!uid) uid = await system.inc('user');
    else uid = parseInt(uid, 10);
    if (Number.isNaN(uid)) throw new Error('uid');
    await user.create({
        uid, uname, password, mail, regip: '127.0.0.1',
    });
    return uid;
}

export const validate = {
    uname: { $type: 'string' },
    password: { $type: 'string' },
    mail: { $type: 'string' },
};

global.Hydro.script.register = { run, description, validate };
