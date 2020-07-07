const description = 'Add blacklist by ip, uid';

// This code format is just for fun. DO NOT DO THIS IN YOUR CODE !
/* eslint-disable */
const { ObjectID } = require('mongodb');
const document = require('../model/document');
const discussion = require('../model/discussion');
const user = require('../model/user');
const blacklist = require('../model/blacklist');
const db = require('../service/db');

async function _address(ip, bset, uset, dset, dryrun, report)                                      {
    if (bset.has(ip))
        return
    bset.add(ip)
    report({ message: `ip ${ip}` })
    const users = await db.collection('user').find({ loginip: ip }).toArray()
    const tasks = []
    for (const udoc of users)                                                                      {
        tasks.push(_user(udoc._id, bset, uset, dset, dryrun, report))                              }
    await Promise.all(tasks)
    if (!dryrun)
        await blacklist.add(ip)                                                                    }

async function _discussion(domainId, did, bset, uset, dset, dryrun, report)                        {
    if (dset.has(did))
        return
    dset.add(did)
    const ddoc = await discussion.get(domainId, did)
    if (!ddoc)
        return
    report({ message: `discussion ${ddoc['title']}` })
    await _user(ddoc['owner'], bset, uset, dset, dryrun, report)
    if (ddoc.ip)
        await _address(ddoc['ip'], bset, uset, dset, dryrun, report)
    if (!dryrun)
        await discussion.delete(domainId, ddoc['docId'])                                           }

async function _user(uid, bset, uset, dset, dryrun, report)                                        {
    if (uset.has(uid))
        return
    uset.add(uid)
    const udoc = await user.getById(uid)
    if (!udoc)
        return
    report({ message: `user ${udoc['_id']} ${udoc['uname']}` })
    await _address(udoc['loginip'], bset, uset, dset, dryrun, report)
    const ddocs = await db.collection('document')
        .find({ docType: document.TYPE_DISCUSSION }).sort({ domainId: 1, docId: 1 }).toArray()
    const tasks = []
    for (const ddoc of ddocs)
        tasks.push(_discussion(ddoc.domainId, ddoc.docId, bset, uset, dset, dryrun, report))
    await Promise.all(tasks)
    if (!dryrun)
        await user.ban(uid)                                                                        }

async function run({address = null, discuss = null, user = null, dryrun = true}, report)           {
    if (address)
        await _address(address, new Set(), new Set(), new Set(), dryrun, report)
    if (discuss)
        await _discussion(discuss.domainId, new ObjectID(discuss.did),
                          new Set(), new Set(), new Set(), dryrun, report)
    if (user)
        await _user(user, new Set(), new Set(), new Set(), dryrun, report)                         }

global.Hydro.script.blacklist = module.exports = { run, description };
