const
    fs = require('fs'),
    yaml = require('js-yaml');

let locales = {};

String.prototype.format = function (args) {
    var result = this;
    if (arguments.length > 0) {
        if (arguments.length == 1 && typeof (args) == 'object') {
            for (var key in args)
                if (args[key] != undefined) {
                    let reg = new RegExp('({' + key + '})', 'g');
                    result = result.replace(reg, args[key]);
                }
        } else for (var i = 0; i < arguments.length; i++)
            if (arguments[i] != undefined) {
                let reg = new RegExp('({)' + i + '(})', 'g');
                result = result.replace(reg, arguments[i]);
            }
    }
    return result;
};
String.prototype.rawformat = function (object) {
    let res = this.split('{@}');
    return [res[0], object, res[1]];
};
String.prototype.translate = function (language = 'zh_CN') {
    if (locales[language]) return locales[language][this] || this;
    else return this;
};

module.exports = function load(file, language) {
    if (!locales[language]) locales[language] = {};
    let content = fs.readFileSync(file).toString();
    Object.assign(locales[language], yaml.safeLoad(content));
};