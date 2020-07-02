const { ObjectId } = require('mongodb');
const { STATUS_ACCEPTED } = require('./builtin').STATUS;
const file = require('./file');
const document = require('./document');
const domain = require('./domain');
const { ProblemNotFoundError } = require('../error');
const readConfig = require('../lib/readConfig');

/**
 * @typedef {import('../interface').Pdoc} Pdoc
 * @typedef {import('mongodb').ObjectID} ObjectID
 * @typedef {import('mongodb').Cursor} Cursor
 */

class Problem {
    constructor(pdoc) {
        this.docType = document.TYPE_PROBLEM;
        if (pdoc) {
            this._id = pdoc._id;
            this.docId = pdoc.docId;
            this.pid = pdoc.pid;
            this.title = pdoc.title;
            this.content = pdoc.content;
            this.owner = pdoc.owner;
            this.config = pdoc.config;
            this.data = pdoc.data;
            this.nSubmit = pdoc.nSubmit;
            this.nAccept = pdoc.nAccept;
            this.difficulty = pdoc.difficulty || 0;
            this.tag = pdoc.tag || [];
            this.category = pdoc.category || [];
            this.hidden = pdoc.hidden || false;
        } else {
            this._id = new ObjectId();
            this.docId = this._id;
            this.pid = String.random(8);
            this.title = '*';
            this.content = '';
            this.owner = 1;
            this.config = '';
            this.data = null;
            this.nSubmit = 0;
            this.nAccept = 0;
            this.difficulty = 0;
            this.tag = [];
            this.category = [];
            this.hidden = true;
        }
    }
}

/**
 * @param {string} domainId
 * @param {string} title
 * @param {string} content
 * @param {number} owner
 * @param {object} args
 * @returns {Promise<ObjectID>} docId
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
    return await document.add(
        domainId, content, owner, document.TYPE_PROBLEM, d.pidCounter, null, null,
        {
            pid, title, data, category, tag, hidden, nSubmit: 0, nAccept: 0,
        },
    );
}

/**
 * @param {string} domainId
 * @param {string|number} pid
 * @param {number} uid
 * @returns {Promise<Problem>}
 */
async function get(domainId, pid, uid = null, doThrow = true) {
    if (!Number.isNaN(parseInt(pid, 10))) pid = parseInt(pid, 10);
    const pdoc = Number.isInteger(pid)
        ? await document.get(domainId, document.TYPE_PROBLEM, pid)
        : (await document.getMulti(domainId, document.TYPE_PROBLEM, { pid }).toArray())[0];
    if (!pdoc) {
        if (doThrow) throw new ProblemNotFoundError(domainId, pid);
        return null;
    }
    if (uid) {
        pdoc.psdoc = await document.getStatus(domainId, document.TYPE_PROBLEM, pdoc.docId, uid);
    }
    return new Problem(pdoc);
}

/**
 * @param {string} domainId
 * @param {object} query
 * @param {object} sort
 * @param {number} page
 * @param {number} limit
 * @returns {Promise<Problem[]>}
 */
async function getMany(domainId, query, sort, page, limit) {
    const pdocs = await document.getMulti(domainId, query)
        .sort(sort).skip((page - 1) * limit).limit(limit)
        .toArray();
    for (let i = 0; i < pdocs.length; i++) {
        pdocs[i] = new Problem(pdocs[i]);
    }
    return pdocs;
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
 * @returns {Promise<Problem>}
 */
async function edit(domainId, _id, $set) {
    const pdoc = await document.set(domainId, document.TYPE_PROBLEM, _id, $set);
    return new Problem(pdoc);
}

function inc(domainId, _id, field, n) {
    return document.inc(domainId, document.TYPE_PROBLEM, _id, field, n);
}

function count(domainId, query) {
    return document.count(domainId, query);
}

async function random(domainId, query) {
    const cursor = document.getMulti(domainId, document.TYPE_PROBLEM, query);
    const pcount = await cursor.count();
    if (pcount) {
        const pdoc = await cursor.skip(Math.floor(Math.random() * pcount)).limit(1).toArray();
        return pdoc[0].pid;
    } return null;
}

async function getList(domainId, pids, getHidden = false, doThrow = true) {
    pids = Array.from(new Set(pids));
    const r = {};
    const q = { $or: [{ docId: { $in: pids } }, { pid: { $in: pids } }] };
    if (!getHidden) q.hidden = false;
    const pdocs = await document.getMulti(domainId, document.TYPE_PROBLEM, q).toArray();
    for (const pdoc of pdocs) {
        r[pdoc.docId] = r[pdoc.pid] = pdoc;
    }
    if (pdocs.length !== pids.length) {
        for (const pid of pids) {
            if (!r[pid]) {
                if (doThrow) {
                    throw new ProblemNotFoundError(domainId, pid);
                } else {
                    r[pid] = new Problem();
                }
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

function setStar(domainId, pid, uid, star) {
    return document.setStatus(domainId, document.TYPE_PROBLEM, pid, uid, { star });
}

async function setTestdata(domainId, _id, filePath) {
    const pdoc = await get(domainId, _id);
    const config = await readConfig(filePath);
    const id = await file.add(filePath, 'data.zip');
    if (pdoc.data && typeof pdoc.data === 'object') file.dec(pdoc.data);
    return await edit(domainId, _id, { data: id, config });
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
    setStar,
    setTestdata,
    updateStatus,
};
