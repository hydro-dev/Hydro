const builtin = require('./builtin');
const document = require('./document');
const db = require('../service/db');
const validator = require('../lib/validator');

const coll = db.collection('domain');

/**
 * @typedef {import('../interface').Pdoc} Pdoc
 * @typedef {import('bson').ObjectID} ObjectID
 * @typedef {import('mongodb').Cursor} Cursor
 */

/**
 * @param {string} domainId
 * @param {number} owner
 */
function add(domainId, owner) {
    const tasks = [
        coll.insertOne({ _id: domainId, owner, bulletin: '' }),
    ];
    for (const id in builtin.BUILTIN_ROLES) {
        tasks.push(
            document.add(
                domainId, builtin.BUILTIN_ROLES[id].perm, owner,
                document.TYPE_DOMAIN_ROLE, id,
            ),
        );
    }
    return Promise.all(tasks);
}

/**
 * @param {string} domainId
 * @returns {Ddoc}
 */
async function get(domainId) {
    return coll.findOne({ _id: domainId });
}

/**
 * @param {object} query
 * @param {object} sort
 * @param {number} page
 * @param {number} limit
 * @returns {Ddoc[]}
 */
function getMany(query, sort, page, limit) {
    return coll.find(query).sort(sort).skip((page - 1) * limit).limit(limit)
        .toArray();
}

/**
 * @param {object} query
 * @returns {Cursor}
 */
function getMulti(query) {
    return coll.find(query);
}

/**
 * @param {string} domainId
 * @param {object} $set
 * @returns {Ddoc}
 */
function edit(domainId, $set) {
    if ($set.title) validator.checkTitle($set.title);
    if ($set.content) validator.checkContent($set.content);
    return coll.updateOne({ _id: domainId }, { $set });
}

async function inc(domainId, field, n) {
    const res = await coll.findOneAndUpdate(
        { _id: domainId },
        { $inc: { [field]: n } },
        { returnOriginal: false },
    );
    return res.value;
}

async function getList(domainIds) {
    const r = {};
    // eslint-disable-next-line no-await-in-loop
    for (const domainId of domainIds) r[domainId] = await get(domainId);
    return r;
}

global.Hydro.model.domain = module.exports = {
    add,
    inc,
    get,
    getMany,
    edit,
    getMulti,
    getList,
};
