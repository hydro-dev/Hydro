import { PRIV } from '../model/builtin';
import user from '../model/user';
import db from '../service/db';

export const description = 'Delete a user';

const collDocument = db.collection('document');
const collDomainUser = db.collection('domain.user');
const collRecord = db.collection('record');
const collMessage = db.collection('message');

export async function run({ uid }) {
    await collDocument.deleteMany({ owner: uid });
    await collRecord.deleteMany({ uid });
    await collDomainUser.deleteMany({ uid });
    await collMessage.deleteMany({ $or: [{ from: uid }, { to: uid }] });
    await user.setPriv(uid, PRIV.PRIV_NONE);
    return uid;
}

export const validate = {
    uid: 'number',
};

global.Hydro.script.deleteUser = { run, description, validate };
