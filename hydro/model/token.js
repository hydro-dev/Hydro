const
    db = require('../service/db.js'),
    coll = db.collection('token');

module.exports = {
    TYPE_SESSION: 0,
    TYPE_REGISTER: 2,
    /**
     * Add a token.
     * @param {number} tokenType type of the token.
     * @param {number} expireSeconds expire time, in seconds.
     * @param {object} data extra data.
     * @returns {string} token ID
     */
    async add(tokenType, expireSeconds, data) {
        let now = new Date();
        let str = String.random(32);
        let res = await coll.insertOne(Object.assign({}, data, {
            _id: str,
            tokenType,
            createAt: now,
            updateAt: now,
            expireAt: new Date(now.getTime() + expireSeconds * 1000)
        }));
        return [str, res.ops];
    },

    /**
     * Get a token.
     * @param {string} tokenId token ID.
     * @param {number} tokenType type of the token.
     * @returns {object} The token document, or null.
     */
    get(tokenId, tokenType) {
        return coll.findOne({ _id: tokenId, tokenType });
    },

    /**
     * Update a token.
     * @param {string} tokenId token ID.
     * @param {number} tokenType type of the token.
     * @param {number} expireSeconds expire time, in seconds.
     * @param {object} data extra data.
     * @returns {object} The token document, or null.
     */
    async update(tokenId, tokenType, expireSeconds, data) {
        let now = new Date();
        let res = await coll.findOneAndUpdate({ _id: tokenId, tokenType }, {
            $set: Object.assign({
                updateAt: now,
                expireAt: new Date(now.getTime() + expireSeconds * 1000)
            }, data, { tokenType })
        });
        return res.value;
    },

    /**
     * Delete a token.
     * @param {string} tokenId  token ID.
     * @param {int} tokenType type of the token.
     * @returns {boolean} true if deleted, or false.
     */
    async delete(tokenId, tokenType) {
        let result = await coll.delete_one({ _id: tokenId, tokenType });
        return !!result.deletedCount;
    },

    init: () => Promise.all([
        coll.createIndex([{ uid: 1 }, { tokenType: 1 }, { updateAt: -1 }], { sparse: true }),
        coll.createIndex('expireAt', { expireAfterSeconds: 0 })
    ])
};