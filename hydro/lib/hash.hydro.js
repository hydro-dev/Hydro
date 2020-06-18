const crypto = require('crypto');

function hash(password, salt) {
    return crypto.pbkdf2Sync(password, salt, 100000, 64, 'sha256').toString('hex').substr(0, 64);
}

global.Hydro.lib['hash.hydro'] = module.exports = hash;
