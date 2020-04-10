const crypto = require('crypto');
module.exports = {
    _b64encode: str => new Buffer(str).toString('base64'),
    _b64decode: str => new Buffer(str, 'base64').toString(),
    _md5: str => crypto.createHash('md5').update(str).digest('hex'),
    _sha1: str => crypto.createHash('sha1').update(str).digest('hex'),
    /**
     * @param {string} password
     * @param {string} salt
     * @param {string} hash
     */
    check(password, salt, hash) {
        return hash == this.hash(password, salt);
    },
    /**
     * @param {string} password
     * @param {string} salt
     */
    hash(password, salt) {
        let res = crypto.pbkdf2Sync(password, salt, 100000, 64, 'sha256');
        return res.toString('Hex');
    },
    salt() {
        return String.random();
    }
};