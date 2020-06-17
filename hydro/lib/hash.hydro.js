const crypto = require('crypto');

function hash(password, salt) {
    return crypto.pbkdf2Sync(password, salt, 100000, 64, 'sha256').toString('hex');
}

global.Hydro.lib['hash.hydro'] = module.exports = hash;
