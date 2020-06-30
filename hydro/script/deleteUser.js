const description = 'Delete a user';

/* eslint-disable no-await-in-loop */
const user = require('../model/user');
const document = require('../model/document');
const setting = require('../model/setting');
const db = require('../service/db');
const paginate = require('../lib/paginate');
const { STATUS, PRIV } = require('../model/builtin');

const collDocument = db.collection('document');
const collStatus = db.collection('document.status');
const collRecord = db.collection('record');

const $unset = {
    regip: '', regat: '', loginat: '', loginip: '',
};
for (const s of setting.PREFERENCE_SETTINGS) {
    $unset[s.key] = '';
}

async function deleteRecord(uid) {
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

async function deleteDiscussion(uid) {
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

async function run({
    uid,
}) {
    await deleteRecord(uid);
    await deleteDiscussion(uid);
    await collStatus.deleteMany({ uid, docType: document.TYPE_DOMAIN_USER });
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

global.Hydro.script.deleteUser = module.exports = { run, description };
