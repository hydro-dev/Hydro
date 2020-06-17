const crypto = require('crypto');

/**
 * @param {string} password
 * @param {string} salt
 */
function hash(password, salt) {
    const res = crypto.pbkdf2Sync(password, salt, 100000, 64, 'sha256');
    return res.toString('Hex');
}

global.Hydro.lib['hash.hydro'] = module.exports = hash;
