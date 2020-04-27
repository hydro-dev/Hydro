const locales = require('../../.build/locales.json');

String.prototype.format = function formatStr(...args) {
    let result = this;
    if (args.length > 0) {
        if (args.length === 1 && typeof (args[0]) === 'object') {
            for (const key in args) {
                if (args[key] !== undefined) {
                    const reg = new RegExp(`(\\{${key}\\})`, 'g');
                    result = result.replace(reg, args[key]);
                }
            }
        } else {
            for (let i = 0; i < args.length; i++) {
                if (args[i] !== undefined) {
                    const reg = new RegExp(`(\\{)${i}(\\})`, 'g');
                    result = result.replace(reg, args[i]);
                }
            }
        }
    }
    return result;
};
String.prototype.rawformat = function rawFormat(object) {
    const res = this.split('{@}');
    return [res[0], object, res[1]];
};
String.prototype.translate = function translate(language = 'zh_CN') {
    if (locales[language]) return locales[language][this] || this;
    return this;
};

module.exports = locales;
