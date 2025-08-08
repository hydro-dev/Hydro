/* eslint-disable ts/no-use-before-define */
import { ObjectId } from 'mongodb';
import Schema from 'schemastery';
import blacklist from '../model/blacklist';
import * as discussion from '../model/discussion';
import * as document from '../model/document';
import UserModel from '../model/user';
import db from '../service/db';

async function _address(
    ip: string,
    bset: Set<string>, uset: Set<number>, dset: Set<ObjectId>,
    dryrun: boolean, report: Function,
) {
    if (bset.has(ip)) return;
    bset.add(ip);
    report({ message: `ip ${ip}` });
    const users = await db.collection('user').find({ ip }).toArray();
    const tasks = [];
    for (const udoc of users) {
        tasks.push(_user(udoc._id, bset, uset, dset, dryrun, report));
    }
    await Promise.all(tasks);
    if (!dryrun) await blacklist.add(ip);
}

async function _discussion(
    domainId: string, did: ObjectId,
    bset: Set<string>, uset: Set<number>, dset: Set<ObjectId>,
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
    bset: Set<string>, uset: Set<number>, dset: Set<ObjectId>,
    dryrun: boolean, report: Function,
) {
    if (uset.has(uid)) return;
    uset.add(uid);
    const udoc = await UserModel.getById('system', uid);
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
    if (!dryrun) await UserModel.ban(uid);
}

export const apply = (ctx) => ctx.addScript(
    'blacklist', 'Add blacklist by ip, uid',
    Schema.object({
        address: Schema.string(),
        discuss: Schema.object({
            domainId: Schema.string(),
            did: Schema.string(),
        }),
        user: Schema.number(),
        dryrun: Schema.boolean(),
    }),
    async ({
        address = null, discuss = null, user = null, dryrun = true,
    }, report) => {
        if (address) await _address(address, new Set(), new Set(), new Set(), dryrun, report);
        if (discuss) {
            await _discussion(
                discuss.domainId, new ObjectId(discuss.did),
                new Set(), new Set(), new Set(), dryrun, report,
            );
        }
        if (user) await _user(user, new Set(), new Set(), new Set(), dryrun, report);
        return true;
    },
);
