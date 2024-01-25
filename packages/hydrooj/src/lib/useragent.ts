import * as browser from 'detect-browser';

export function parse(str: string) {
    return browser.parseUserAgent(str);
}
