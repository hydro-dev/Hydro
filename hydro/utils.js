const dict = 'abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ1234567890';

String.random = function random(digit) {
    let str = '';
    for (let i = 1; i <= digit; i++) str += dict[Math.floor(Math.random() * 62)];
    return str;
};

Array.isDiff = function isDiff(a, b) {
    if (a.length !== b.length) return true;
    a.sort();
    b.sort();
    for (const i in a) { if (a[i] !== b[i]) return true; }
    return false;
};

/**
 * @param {string} format %Y-%m-%d %H:%M:%S
 * @returns {string} Formatted date string
 */
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

/**
 * @param {object} param0
 * @returns {Date}
 */
Date.prototype.delta = function delta({
    year = 0, month = 0, day = 0, hour = 0, minute = 0, second = 0,
}) {
    let ts = this.getTime();
    ts += second * 1000 + minute * 60000 + hour * 60 * 60000;
    ts += day * 24 * 60 * 60000 + month * 30 * 24 * 60 * 60000 + year * 365 * 24 * 60 * 60000;
    return new Date(ts);
};

Set.isSuperset = function isSuperset(set, subset) {
    for (const elem of subset) {
        if (!set.has(elem)) return false;
    }
    return true;
};

Set.union = function Union(setA, setB) {
    const union = new Set(setA);
    for (const elem of setB) union.add(elem);
    return union;
};

Set.intersection = function Intersection(setA, setB) {
    const intersection = new Set();
    for (const elem of setB) {
        if (setA.has(elem)) intersection.add(elem);
    }
    return intersection;
};
