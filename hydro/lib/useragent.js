const browser = require('detect-browser');

function parse(str) {
    return browser.parseUserAgent(str);
}

function icon(str) {
    return str.split(' ')[0].toLowerCase();
}

global.Hydro.lib.useragent = module.exports = { parse, icon };
