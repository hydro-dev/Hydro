import crypto from 'crypto';

function hash(password: string, salt: string) {
    return crypto.pbkdf2Sync(password, salt, 100000, 64, 'sha256').toString('hex').substring(0, 64);
}

export = hash;
global.Hydro.module.hash.hydro = hash;
