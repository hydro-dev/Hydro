import * as user from '../model/user';
import { PRIV } from '../model/builtin';

export const description = 'Set a user as superadmin.';

export async function run({ uid }) {
    uid = parseInt(uid, 10);
    if (Number.isNaN(uid)) throw new Error('uid');
    await user.setPriv(uid, PRIV.PRIV_ALL);
    return uid;
}

export const validate = {
    uid: { $type: 'number' },
};

global.Hydro.script.setSuperadmin = { run, description, validate };
