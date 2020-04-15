const map = [
    'a', 'b', 'c', 'd', 'e', 'f', 'g', 'h', 'i', 'j',
    'k', 'l', 'm', 'n', 'o', 'p', 'q', 'r', 's', 't',
    'u', 'v', 'w', 'x', 'y', 'z', 'A', 'B', 'C', 'D',
    'E', 'F', 'G', 'H', 'I', 'J', 'K', 'L', 'M', 'N',
    'O', 'P', 'Q', 'R', 'S', 'T', 'U', 'V', 'W', 'X',
    'Y', 'Z', '1', '2', '3', '4', '5', '6', '7', '8',
    '9', '0',
];

String.random = function random(digit) {
    let str = '';
    for (let i = 1; i <= digit; i++) str += map[Math.floor(Math.random() * 62)];
    return str;
};

/**
 * @param {Array} a
 * @param {Array} b
 */
Array.isDiff = function isDiff(a, b) {
    if (a.length !== b.length) return true;
    a.sort();
    b.sort();
    for (const i in a) { if (a[i] !== b[i]) return true; }
    return false;
};

Date.prototype.format = function formatDate(fmt = '%Y-%m-%d %H:%M:%S') {
    return fmt
        .replace('%Y', this.getFullYear())
        .replace('%m', this.getMonth() + 1)
        .replace('%D', this.getDate())
        .replace('%d', this.getDate())
        .replace('%H', this.getHours())
        .replace('%M', this.getMinutes())
        .replace('%S', this.getSeconds());
};
