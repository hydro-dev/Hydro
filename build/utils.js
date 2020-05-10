const fs = require('fs');
const path = require('path');

exports.root = (name) => path.resolve(__dirname, '..', name);
exports.exist = (name) => {
    try {
        fs.statSync(exports.root(name));
    } catch (e) {
        return false;
    }
    return true;
};
exports.rmdir = function rmdir(p, recursive = true) {
    if (!fs.existsSync(p)) return;
    if (recursive) {
        fs.readdirSync(p).forEach((file) => {
            const curPath = `${p}/${file}`;
            if (fs.statSync(curPath).isDirectory()) rmdir(curPath);
            else fs.unlinkSync(curPath);
        });
    }
    fs.rmdirSync(p);
};
exports.ignoreFailure = function ignoreFailure(func, ...params) {
    try {
        func(...params);
    } catch (e) { } // eslint-disable-line no-empty
};
