import crypto from 'crypto';

async function hash(password: string, salt: string): Promise<string> {
    return new Promise((resolve, reject) => {
        crypto.pbkdf2(password, salt, 100000, 64, 'sha256', (err, key) => {
            if (err) reject(err);
            else resolve(key.toString('hex').substring(0, 64));
        });
    });
}

export = hash;
global.Hydro.module.hash.hydro = hash;
