/* eslint-disable no-await-in-loop */
import { Udoc } from '../interface';
import { Value } from '../typeutils';
import * as user from '../model/user';
import * as document from '../model/document';
import * as setting from '../model/setting';
import db from '../service/db';
import paginate from '../lib/paginate';
import { STATUS, PRIV } from '../model/builtin';

export const description = 'Delete a user';

const collDocument = db.collection('document');
const collDomainUser = db.collection('domain.user');
const collRecord = db.collection('record');

const $unset: Value<Partial<Udoc>> = {
    regip: '', regat: '', loginat: '', loginip: '',
};
for (const s of setting.PREFERENCE_SETTINGS) {
    $unset[s.key] = '';
}

async function deleteRecord(uid: number) {
    const [, pcount] = await paginate(
        collRecord.find(),
        1,
        100,
    );
    for (let i = 1; i <= pcount; i++) {
        const [rdocs] = await paginate(
            collRecord.find(),
            1,
            100,
        );
        const tasks = [];
        for (const rdoc of rdocs) {
            if (rdoc.pid) {
                tasks.push(document.inc(rdoc.domainId, document.TYPE_PROBLEM, rdoc.pid, 'nSubmit', -1));
            }
            if (rdoc.status === STATUS.STATUS_ACCEPTED) {
                tasks.push(document.inc(rdoc.domainId, document.TYPE_PROBLEM, rdoc.pid, 'nAccept', -1));
            }
        }
        await Promise.all(tasks);
    }
    await collRecord.deleteMany({ uid });
}

async function deleteDiscussion(uid: number) {
    const [, pcount] = await paginate(
        collDocument.find({ docType: document.TYPE_DISCUSSION, owner: uid }),
        1,
        100,
    );
    for (let i = 1; i <= pcount; i++) {
        const [ddocs] = await paginate(
            collDocument.find({ docType: document.TYPE_DISCUSSION, owner: uid }),
            1,
            100,
        );
        const tasks = [];
        for (const ddoc of ddocs) {
            tasks.push(document.deleteMulti(ddoc.domainId, document.TYPE_DISCUSSION_REPLY, {
                parentId: ddoc.docId,
                parentType: document.TYPE_DISCUSSION,
            }));
        }
        await Promise.all(tasks);
    }
    await collDocument.deleteMany({ docType: document.TYPE_DISCUSSION, owner: uid });
    // TODO delete replies
}

export async function run({
    uid,
}) {
    await deleteRecord(uid);
    await deleteDiscussion(uid);
    await collDomainUser.deleteMany({ uid });
    const uname = String.random(32);
    await user.setById(uid, {
        uname,
        unameLower: uname.toLowerCase(),
        priv: PRIV.PRIV_NONE,
    }, $unset);
    await user.setPassword(uid, String.random(32));
    // TODO delete contest, homework, etc
    return uid;
}

export const validate = {
    uid: 'number',
};

global.Hydro.script.deleteUser = { run, description, validate };
