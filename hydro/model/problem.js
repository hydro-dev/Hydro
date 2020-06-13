const { STATUS_ACCEPTED } = require('./builtin').STATUS;
const file = require('./file');
const document = require('./document');
const domain = require('./domain');
const { ProblemNotFoundError } = require('../error');

/**
 * @typedef {import('../interface').Pdoc} Pdoc
 * @typedef {import('bson').ObjectID} ObjectID
 * @typedef {import('mongodb').Cursor} Cursor
 */

/**
 * @param {string} domainId
 * @param {string} title
 * @param {string} content
 * @param {number} owner
 * @param {number} pid
 * @param {import('bson').ObjectID} data
 * @param {string[]} category
 * @param {string[]} tag
 * @param {boolean} hidden
 */
async function add(domainId, title, content, owner, {
    pid = null,
    data = null,
    category = [],
    tag = [],
    hidden = false,
}) {
    const d = await domain.inc(domainId, 'pidCounter', 1);
    if (!pid) pid = d.pidCounter.toString();
    return await document.add(domainId, content, owner, document.TYPE_PROBLEM, d.pidCounter, null, null, {
        pid, title, data, category, tag, hidden, nSubmit: 0, nAccept: 0,
    });
}

/**
 * @param {string} domainId
 * @param {string|number} pid
 * @param {number} uid
 * @returns {Pdoc}
 */
async function get(domainId, pid, uid = null) {
    const pdoc = Number.isInteger(pid)
        ? await document.get(domainId, document.TYPE_PROBLEM, pid)
        : (await document.getMulti(domainId, document.TYPE_PROBLEM, { pid }).toArray())[0];
    if (!pdoc) throw new ProblemNotFoundError(domainId, pid);
    if (uid) {
        pdoc.psdoc = await document.getStatus(domainId, document.TYPE_PROBLEM, pdoc.docId, uid);
    }
    return pdoc;
}

/**
 * @param {string} domainId
 * @param {object} query
 * @param {object} sort
 * @param {number} page
 * @param {number} limit
 * @returns {Pdoc[]}
 */
function getMany(domainId, query, sort, page, limit) {
    return document.getMulti(domainId, query).sort(sort).skip((page - 1) * limit).limit(limit)
        .toArray();
}

/**
 * @param {string} domainId
 * @param {object} query
 * @returns {Cursor}
 */
function getMulti(domainId, query) {
    return document.getMulti(domainId, document.TYPE_PROBLEM, query);
}

/**
 * @param {string} domainId
 * @param {object} query
 * @returns {Cursor}
 */
function getMultiStatus(domainId, query) {
    return document.getMultiStatus(domainId, document.TYPE_PROBLEM, query);
}

/**
 * @param {string} domainId
 * @param {ObjectID} _id
 * @param {object} query
 * @returns {Pdoc}
 */
function edit(domainId, _id, $set) {
    return document.set(domainId, document.TYPE_PROBLEM, _id, $set);
}

function inc(domainId, _id, field, n) {
    return document.inc(domainId, document.TYPE_PROBLEM, _id, field, n);
}

function count(domainId, query) {
    return document.count(domainId, query);
}

async function random(domainId, query) {
    const cursor = document.getMulti(domainId, query);
    const pcount = await cursor.count();
    if (pcount) {
        const pdoc = await cursor.skip(Math.floor(Math.random() * pcount)).limit(1).toArray();
        return pdoc[0].pid;
    } return null;
}

async function getList(domainId, pids, doThrow = true) {
    pids = new Set(pids);
    const r = {};
    const pdocs = await document.getMulti(
        domainId, document.TYPE_PROBLEM,
        { $or: [{ docId: { $in: pids } }, { pid: { $in: pids } }] },
    ).toArray();
    for (const pdoc of pdocs) {
        r[pdoc.docId] = r[pdoc.pid] = pdoc;
    }
    if (pdocs.length !== pids.size) {
        if (doThrow) {
            for (const pid of pids) {
                if (!r[pid]) throw new ProblemNotFoundError(domainId, pid);
            }
        }
    }
    return r;
}

async function getListStatus(domainId, uid, pids) {
    const psdocs = await getMultiStatus(
        domainId, { uid, docId: { $in: Array.from(new Set(pids)) } },
    ).toArray();
    const r = {};
    for (const psdoc of psdocs) r[psdoc.docId] = psdoc;
    return r;
}

async function updateStatus(domainId, pid, uid, rid, status) {
    try {
        await document.setIfNotStatus(domainId, document.TYPE_PROBLEM, pid, uid, 'status', status, STATUS_ACCEPTED, { rid });
    } catch (e) {
        return false;
    }
    return true;
}

async function setTestdata(domainId, _id, readStream) {
    // TODO read config in zipfile
    const pdoc = await get(domainId, _id);
    const id = await file.add(readStream, 'data.zip');
    if (pdoc.data && typeof pdoc.data === 'object') file.dec(this.pdoc.data);
    return await edit(domainId, _id, { data: id }); // eslint-disable-line no-return-await
}

global.Hydro.model.problem = module.exports = {
    add,
    inc,
    get,
    getMany,
    edit,
    count,
    random,
    getMulti,
    getList,
    getListStatus,
    getMultiStatus,
    setTestdata,
    updateStatus,
};
