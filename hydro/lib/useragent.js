const browser = require('detect-browser');

function get(str) {
    const ua = browser.parseUserAgent(str);
    console.log(ua);
    return ua;
}

global.Hydro.lib.useragent = module.exports = get;
