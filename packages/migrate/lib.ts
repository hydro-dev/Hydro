import { md5, sha1 } from 'hydrooj/src/lib/crypto';

const RE_MD5 = /^[\da-f]{32}$/;

global.Hydro.lib['hash.hust'] = ($password: string, $saved: string) => {
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
};

global.Hydro.lib['hash.vj2'] = (password: string, salt: string, udoc: { uname: string; unameLower: string }) => {
    const { uname, unameLower } = udoc;
    const pmd5 = md5(password);
    const mixedSha1 = sha1(md5(unameLower + pmd5) + salt + sha1(pmd5 + salt));
    return `${Buffer.from(uname).toString('base64')}|${mixedSha1}`;
};
