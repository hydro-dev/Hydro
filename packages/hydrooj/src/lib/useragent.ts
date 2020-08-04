import * as browser from 'detect-browser';

export function parse(str: string) {
    return browser.parseUserAgent(str);
}

export function icon(str: string) {
    return str.split(' ')[0].toLowerCase();
}

global.Hydro.lib.useragent = { parse, icon };
