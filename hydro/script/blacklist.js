// This code format is just for fun. DO NOT DO THIS IN YOUR CODE !
/* eslint-disable */
const { ObjectID } = require('bson');
const document = require('../model/document');
const discussion = require('../model/discussion');
const user = require('../model/user');
const blacklist = require('../model/blacklist');
const db = require('../service/db.js');

async function _address(ip, bset, uset, dset, dryrun)                                              {
    if (bset.has(ip))
        return
    bset.add(ip)
    console.log('ip %s', ip)
    const users = await db.collection('user').find({ loginip: ip }).toArray()
    const tasks = []
    for (const udoc of users)                                                                      {
        tasks.push(_user(udoc._id, bset, uset, dset, dryrun))                                      }
    await Promise.all(tasks)
    if (!dryrun)
        await blacklist.add(ip)                                                                    }

async function _discussion(domainId, did, bset, uset, dset, dryrun)                                {
    if (dset.has(did))
        return
    dset.add(did)
    const ddoc = await discussion.get(domainId, did)
    if (!ddoc)
        return
    console.log('discussion %s', ddoc['title'])
    await _user(ddoc['owner'], bset, uset, dset, dryrun)
    if (ddoc.ip)
        await _address(ddoc['ip'], bset, uset, dset, dryrun)
    if (!dryrun)
        await discussion.delete(domainId, ddoc['docId'])                                           }

async function _user(uid, bset, uset, dset, dryrun)                                                {
    if (uset.has(uid))
        return
    uset.add(uid)
    const udoc = await user.getById(uid)
    if (!udoc)
        return
    console.log('user %s %s', udoc['_id'], udoc['uname'])
    await _address(udoc['loginip'], bset, uset, dset, dryrun)
    const ddocs = await db.collection('document')
        .find({ docType: document.TYPE_DISCUSSION }).sort({ domainId: 1, docId: 1 }).toArray()
    const tasks = []
    for (const ddoc of ddocs)
        tasks.push(_discussion(ddoc.domainId, ddoc.docId, bset, uset, dset, dryrun))
    await Promise.all(tasks)
    if (!dryrun)
        await user.ban(uid)                                                                        }

async function run({address = null, discuss = null, user = null, dryrun = true})                   {
    if (address)
        await _address(address, new Set(), new Set(), new Set(), dryrun)
    if (discuss)
        await _discussion(discuss.domainId, new ObjectID(discuss.did),
                          new Set(), new Set(), new Set(), dryrun)
    if (user)
        await _user(user, new Set(), new Set(), new Set(), dryrun)                                 }

global.Hydro.script.blacklist = module.exports = { run };
