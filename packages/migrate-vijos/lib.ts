import 'hydrooj';

const { md5, sha1 } = global.Hydro.lib;

interface Udoc {
    uname: string,
    unameLower: string,
}

function hash(password: string, salt: string, udoc: Udoc) {
    const { uname, unameLower } = udoc;
    const pmd5 = md5(password);
    const mixedSha1 = sha1(md5(unameLower + pmd5) + salt + sha1(pmd5 + salt));
    return `${Buffer.from(uname).toString('base64')}|${mixedSha1}`;
}

global.Hydro.lib['hash.vj2'] = hash;
