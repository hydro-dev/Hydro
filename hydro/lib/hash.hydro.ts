import crypto from 'crypto';

export default function hash(password: string, salt: string) {
    return crypto.pbkdf2Sync(password, salt, 100000, 64, 'sha256').toString('hex').substr(0, 64);
}

global.Hydro.lib['hash.hydro'] = hash;
