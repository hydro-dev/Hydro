/* eslint-disable @typescript-eslint/no-use-before-define */
import { ObjectID } from 'mongodb';
import * as document from '../model/document';
import * as discussion from '../model/discussion';
import user from '../model/user';
import blacklist from '../model/blacklist';
import db from '../service/db';

export const description = 'Add blacklist by ip, uid';

async function _address(
    ip: string,
    bset: Set<string>, uset: Set<number>, dset: Set<ObjectID>,
    dryrun: boolean, report: Function,
) {
    if (bset.has(ip)) return;
    bset.add(ip);
    report({ message: `ip ${ip}` });
    const users = await db.collection('user').find({ $or: [{ loginip: ip }, { regip: ip }] }).toArray();
    const tasks = [];
    for (const udoc of users) {
        tasks.push(_user(udoc._id, bset, uset, dset, dryrun, report));
    }
    await Promise.all(tasks);
    if (!dryrun) await blacklist.add(ip);
}

async function _discussion(
    domainId: string, did: ObjectID,
    bset: Set<string>, uset: Set<number>, dset: Set<ObjectID>,
    dryrun: boolean, report: Function,
) {
    if (dset.has(did)) return;
    dset.add(did);
    const ddoc = await discussion.get(domainId, did);
    if (!ddoc) return;
    report({ message: `discussion ${ddoc.title}` });
    await _user(ddoc.owner, bset, uset, dset, dryrun, report);
    if (ddoc.ip) await _address(ddoc.ip, bset, uset, dset, dryrun, report);
    if (!dryrun) await discussion.del(domainId, ddoc.docId);
}

async function _user(
    uid: number,
    bset: Set<string>, uset: Set<number>, dset: Set<ObjectID>,
    dryrun: boolean, report: Function,
) {
    if (uset.has(uid)) return;
    uset.add(uid);
    const udoc = await user.getById('system', uid);
    if (!udoc) return;
    report({ message: `user ${udoc._id} ${udoc.uname}` });
    await _address(udoc._loginip, bset, uset, dset, dryrun, report);
    const ddocs = await db.collection('document').find({ docType: document.TYPE_DISCUSSION, owner: uid })
        .sort({ domainId: 1, docId: 1 }).toArray();
    const tasks = [];
    for (const ddoc of ddocs) {
        tasks.push(_discussion(ddoc.domainId, ddoc.docId, bset, uset, dset, dryrun, report));
    }
    await Promise.all(tasks);
    if (!dryrun) await user.ban(uid);
}

export async function run({
    // eslint-disable-next-line @typescript-eslint/no-shadow
    address = null, discuss = null, user = null, dryrun = true,
}, report) {
    if (address) await _address(address, new Set(), new Set(), new Set(), dryrun, report);
    if (discuss) {
        await _discussion(
            discuss.domainId, new ObjectID(discuss.did),
            new Set(), new Set(), new Set(), dryrun, report,
        );
    }
    if (user) await _user(user, new Set(), new Set(), new Set(), dryrun, report);
}

export const validate = {
    address: 'string?',
    discuss: 'string?',
    user: 'number?',
    dryrun: 'boolean?',
};

global.Hydro.script.blacklist = { run, description, validate };
