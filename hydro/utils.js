const
    crypto = require('crypto'),
    map = [
        'a', 'b', 'c', 'd', 'e', 'f', 'g', 'h', 'i', 'j',
        'k', 'l', 'm', 'n', 'o', 'p', 'q', 'r', 's', 't',
        'u', 'v', 'w', 'x', 'y', 'z', 'A', 'B', 'C', 'D',
        'E', 'F', 'G', 'H', 'I', 'J', 'K', 'L', 'M', 'N',
        'O', 'P', 'Q', 'R', 'S', 'T', 'U', 'V', 'W', 'X',
        'Y', 'Z', '1', '2', '3', '4', '5', '6', '7', '8',
        '9', '0'
    ];

String.random = function (digit) {
    let str = '';
    for (let i = 1; i <= digit; i++)
        str += map[Math.floor(Math.random() * 62)];
    return str;
};

exports.pwhash = {
    _b64encode: str => new Buffer(str).toString('base64'),
    _b64decode: str => new Buffer(str, 'base64').toString(),
    _md5: str => crypto.createHash('md5').update(str).digest('hex'),
    _sha1: str => crypto.createHash('sha1').update(str).digest('hex'),
    /**
     * @param {string} password
     * @param {string} salt
     * @param {string} hash
     */
    check(password, salt, hash) {
        return hash == this.hash(password, salt);
    },
    /**
     * @param {string} password
     * @param {string} salt
     */
    hash(password, salt) {
        let res = crypto.pbkdf2Sync(password, salt, 100000, 64, 'sha256');
        return res.toString('Hex');
    },
    salt() {
        return String.random();
    }
};
