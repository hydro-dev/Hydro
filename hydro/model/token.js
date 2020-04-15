const db = require('../service/db.js');

const coll = db.collection('token');

module.exports = {
    TYPE_SESSION: 0,
    TYPE_CSRF_TOKEN: 1,
    TYPE_REGISTER: 2,
    /**
     * Add a token.
     * @param {number} tokenType type of the token.
     * @param {number} expireSeconds expire time, in seconds.
     * @param {object} data extra data.
     * @returns {Array} token ID, token data
     */
    async add(tokenType, expireSeconds, data) {
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
        const now = new Date();
        const res = await coll.findOneAndUpdate({ _id: tokenId, tokenType }, {
            $set: {
                updateAt: now,
                expireAt: new Date(now.getTime() + expireSeconds * 1000),
                ...data,
                tokenType,
            },
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
        const result = await coll.deleteOne({ _id: tokenId, tokenType });
        return !!result.deletedCount;
    },
    getMostRecentSessionByUid(uid) {
        return coll.findOne({ uid, token_type: this.TYPE_SESSION }, { sort: { updateAt: -1 } });
    },
};
