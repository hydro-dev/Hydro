import { md5, sha1 } from 'hydrooj/src/lib/crypto';

const RE_MD5 = /^[\da-fA-F]{32}$/;

function hash(password: string, stored: string) {
    if (RE_MD5.test(stored)) return md5(password) === stored;
    const salt = Buffer.from(stored, 'base64').toString().substr(0, 20);
    return Buffer.from(sha1(password + salt).substr(0, 20) + salt).toString('base64') === stored;
}

global.Hydro.lib['hash.hust'] = hash;
