import { md5, sha1 } from 'hydrooj/src/lib/crypto';

const RE_MD5 = /^[\da-f]{32}$/;

function hash($password: string, $saved: string) {
    $password = md5($password);
    if (RE_MD5.test($saved)) return $password === $saved;
    const $svd = Buffer.from($saved, 'base64').toString('hex');
    const $salt = Buffer.from($svd.substr(40), 'hex').toString();
    const $hash = Buffer.concat([
        Buffer.from(sha1($password + $salt), 'hex'),
        Buffer.from($salt),
    ]).toString('base64');
    if ($hash.trim() === $saved.trim()) return true;
    return false;
}

global.Hydro.lib['hash.hust'] = hash;
