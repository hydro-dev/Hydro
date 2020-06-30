const fs = require('fs');
const cluster = require('cluster');
const path = require('path');
const superagent = require('superagent');
const proxy = require('superagent-proxy');

proxy(superagent);

if (!cluster.worker) {
    cluster.worker = { id: 0 };
}

const dict = 'abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ1234567890';

String.random = function random(digit = 32) {
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
    let h = this.getHours();
    if (h < 10) h = `0${h}`;
    let m = this.getMinutes();
    if (m < 10) m = `0${m}`;
    let s = this.getSeconds();
    if (s < 10) s = `0${s}`;
    return fmt
        .replace('%Y', this.getFullYear())
        .replace('%m', this.getMonth() + 1)
        .replace('%d', this.getDate())
        .replace('%H', h)
        .replace('%M', m)
        .replace('%S', s);
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

/**
 * calculate size of a file or directory synchronously
 * @param {String} folderPath path of the file or folder
 * @param {fsizeOptions} opts additional options
 * @returns {Number}
 */
function folderSize(folderPath) {
    let size = 0;
    const _next = function a(p) {
        if (p) {
            const stats = fs.statSync(p);
            if (!stats.isDirectory() || stats.isSymbolicLink()) {
                if (!stats.isSymbolicLink()) size += stats.size;
            } else {
                size += stats.size;
                const files = fs.readdirSync(p);
                if (Array.isArray(files)) {
                    files.forEach((file) => {
                        _next(path.join(p, file));
                    });
                }
            }
        }
    };
    _next(folderPath);
    return size;
}

exports.folderSize = folderSize;

const TIME_RE = /^([0-9]+(?:\.[0-9]*)?)([mu]?)s?$/i;
const TIME_UNITS = { '': 1000, m: 1, u: 0.001 };
const MEMORY_RE = /^([0-9]+(?:\.[0-9]*)?)([kmg])b?$/i;
const MEMORY_UNITS = { k: 0.1, m: 1, g: 1024 };

function parseTimeMS(str) {
    const match = TIME_RE.exec(str);
    if (!match) throw new Error(str, 'error parsing time');
    return parseInt(parseFloat(match[1], 10) * TIME_UNITS[match[2]], 10);
}

exports.parseTimeMS = parseTimeMS;

function parseMemoryMB(str) {
    const match = MEMORY_RE.exec(str);
    if (!match) throw new Error(str, 'error parsing memory');
    return parseInt(parseFloat(match[1], 10) * MEMORY_UNITS[match[2]], 10);
}

exports.parseMemoryMB = parseMemoryMB;

/**
 * Checks if an object could be an instantiable class.
 * @param {any} obj
 * @param {boolean} strict
 * @returns {boolean}
 */
function isClass(obj, strict = false) {
    if (typeof obj !== 'function') return false;
    const str = obj.toString();
    if (obj.prototype === undefined) return false;
    if (obj.prototype.constructor !== obj) return false;
    if (str.slice(0, 5) === 'class') return true;
    if (Object.getOwnPropertyNames(obj.prototype).length >= 2) return true;
    if (/^function\s+\(|^function\s+anonymous\(/.test(str)) return false;
    if (strict && /^function\s+[A-Z]/.test(str)) return true;
    if (/\b\(this\b|\bthis[.[]\b/.test(str)) {
        if (!strict || /classCallCheck\(this/.test(str)) return true;
        return /^function\sdefault_\d+\s*\(/.test(str);
    }
    return false;
}

exports.isClass = isClass;
