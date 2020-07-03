const db = require('../service/db');
const { ValidationError } = require('../error');

const coll = db.collection('token');

function ensureIndexes() {
    return Promise.all([
        coll.createIndex([{ uid: 1 }, { tokenType: 1 }, { updateAt: -1 }], { sparse: true }),
        coll.createIndex('expireAt', { expireAfterSeconds: 0 }),
    ]);
}

/**
 * Add a token.
 * @param {number} tokenType type of the token.
 * @param {number} expireSeconds expire time, in seconds.
 * @param {object} data extra data.
 * @returns {Promise<Array>} token ID, token data
 */
async function add(tokenType, expireSeconds, data) {
    const now = new Date();
    const str = String.random(32);
    const res = await coll.insertOne({
        ...data,
        _id: str,
        tokenType,
        createAt: now,
        updateAt: now,
        expireAt: new Date(now.getTime() + expireSeconds * 1000),
    });
    return [str, res.ops[0]];
}

/**
 * Get a token.
 * @param {string} tokenId token ID.
 * @param {number} tokenType type of the token.
 * @returns {Promise<object>} The token document, or null.
 */
async function get(tokenId, tokenType, doThrow = true) {
    const res = await coll.findOne({ _id: tokenId, tokenType });
    if (!res && doThrow) throw new ValidationError('token');
    return res;
}

/**
 * Update a token.
 * @param {string} tokenId token ID.
 * @param {number} tokenType type of the token.
 * @param {number} expireSeconds expire time, in seconds.
 * @param {object} data extra data.
 * @returns {Promise<object>} The token document, or null.
 */
async function update(tokenId, tokenType, expireSeconds, data) {
    const now = new Date();
    const res = await coll.findOneAndUpdate(
        { _id: tokenId, tokenType },
        {
            $set: {
                ...data,
                updateAt: now,
                expireAt: new Date(now.getTime() + expireSeconds * 1000),
                tokenType,
            },
        },
        { returnOriginal: false },
    );
    return res.value;
}

/**
 * Delete a token.
 * @param {string} tokenId  token ID.
 * @param {int} tokenType type of the token.
 * @returns {Promise<boolean>} true if deleted, or false.
 */
async function del(tokenId, tokenType) {
    const result = await coll.deleteOne({ _id: tokenId, tokenType });
    return !!result.deletedCount;
}

/**
 * Update a token(or create one)
 * @param {number} tokenType type of the token.
 * @param {number} expireSeconds expire time, in seconds.
 * @param {object} data extra data.
 * @returns {Array} token ID, token data
 */
async function createOrUpdate(tokenType, expireSeconds, data) {
    const d = await coll.findOne({ tokenType, ...data });
    if (!d) {
        const res = await add(tokenType, expireSeconds, data);
        return res[0];
    }
    await update(d._id, tokenType, expireSeconds, data);
    return d._id;
}

global.Hydro.model.token = module.exports = {
    TYPE_SESSION: 0,
    TYPE_CSRF_TOKEN: 1,
    TYPE_REGISTER: 2,
    TYPE_CHANGEMAIL: 3,
    TYPE_OAUTH: 4,

    ensureIndexes,
    add,
    createOrUpdate,
    get,
    update,
    del,
    delByUid(uid) {
        return coll.deleteMany({ uid });
    },
    getMostRecentSessionByUid(uid) {
        return coll.findOne({ uid, tokenType: this.TYPE_SESSION }, { sort: { updateAt: -1 } });
    },
    getSessionListByUid(uid) {
        return coll.find({ uid, tokenType: this.TYPE_SESSION }).sort('updateAt', -1).toArray();
    },
};
