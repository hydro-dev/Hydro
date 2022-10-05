import Schema from 'schemastery';
import { Context } from '../context';
import { PRIV } from '../model/builtin';
import user from '../model/user';
import db from '../service/db';

const collDocument = db.collection('document');
const collDomainUser = db.collection('domain.user');
const collRecord = db.collection('record');
const collMessage = db.collection('message');

export const apply = (ctx: Context) => ctx.addScript(
    'deleteUser', 'Delete a user',
    Schema.object({
        uid: Schema.number(),
    }),
    async ({ uid }) => {
        await collDocument.deleteMany({ owner: uid });
        await collRecord.deleteMany({ uid });
        await collDomainUser.deleteMany({ uid });
        await collMessage.deleteMany({ $or: [{ from: uid }, { to: uid }] });
        await user.setPriv(uid, PRIV.PRIV_NONE);
        return true;
    },
);
