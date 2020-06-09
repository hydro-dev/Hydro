const crypto = require('crypto');
/**
 * @param {any} content
 * @return {string}
 */
global.Hydro.lib.sha1 = module.exports = (content) => {
    const hash = crypto.createHash('sha1');
    hash.update(content);
    return hash.digest('hex');
};
