const crypto = require('crypto');

global.Hydro.lib['hash.hydro'] = module.exports = {
    /**
     * @param {string} password
     * @param {string} salt
     * @param {string} hash
     */
    check(password, salt, hash) {
        return hash === this.hash(password, salt);
    },
    /**
     * @param {string} password
     * @param {string} salt
     */
    hash(password, salt) {
        const res = crypto.pbkdf2Sync(password, salt, 100000, 64, 'sha256');
        return res.toString('Hex');
    },
};
