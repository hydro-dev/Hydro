
const { md5, sha1 } = global.Hydro.lib;

global.Hydro.lib['hash.vj2'] = module.exports = {
    /**
     * @param {string} password
     * @param {string} salt
     * @param {string} hash
     */
    check(password, salt, hash, udoc) {
        return hash === this.hash(password, salt, udoc);
    },
    /**
     * @param {string} password
     * @param {string} salt
     */
    hash(password, salt, udoc) {
        const { uname, unameLower } = udoc;
        const pmd5 = md5(password);
        const mixedSha1 = sha1(md5(unameLower + pmd5) + salt + sha1(pmd5 + salt));
        return `${Buffer.from(uname).toString('base64')}|${mixedSha1}`;
    },
};
