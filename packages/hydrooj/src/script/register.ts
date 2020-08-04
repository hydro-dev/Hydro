import * as user from '../model/user';

export const description = 'Create a new user';

export async function run({
    uname, password, mail, uid,
}) {
    if (uid) uid = parseInt(uid, 10);
    if (uid && Number.isNaN(uid)) throw new Error('uid');
    uid = await user.create(mail, uname, password, uid);
    return uid;
}

export const validate = {
    uname: { $type: 'string' },
    password: { $type: 'string' },
    mail: { $type: 'string' },
};

global.Hydro.script.register = { run, description, validate };
