/* eslint-disable no-eval */
const fs = require('fs');
const path = require('path');
const yaml = require('js-yaml');

const name = process.argv[2];

const IGNORE_CHECK = ['en'];
const IGNORE_MISSING = [
    '?', 'AC', 'Gravatar', 'ID', 'MD5', 'URL',
];
const RE_SETTING = /Setting\(['"]([\s\S])*?['"](,[^()]*?)\)/gmi;
const LOCALE_ROOT = path.resolve(__dirname, '..', 'locales');
const texts = {};
const result = {};
const locales = fs.readdirSync(LOCALE_ROOT);
let currentFile = '';

// eslint-disable-next-line @typescript-eslint/no-unused-vars
function Setting(str, format) {
    if (!texts[str]) texts[str] = [currentFile];
    else texts[str].push(currentFile);
}

function scanSetting() {
    const file = path.resolve(__dirname, '..', 'hydro', 'model', 'setting.ts');
    const content = fs.readFileSync(file).toString();
    content.replace(RE_SETTING, (substr) => {
        try {
            eval(substr);
        } catch (e) {
            if (e.message.endsWith('is not defined')) {
                global[e.message.split(' ')[0]] = () => { };
                try {
                    eval(substr);
                } catch (err) {
                    console.error('Cannot parse: ', substr, ' in setting');
                }
            } else console.error('Cannot parse: ', substr, ' in setting');
        }
    });
}
scanSetting();
if (!name) {
    for (const locale of locales) {
        if (!IGNORE_CHECK.includes(locale.split('.')[0])) {
            const p = path.join(LOCALE_ROOT, locale);
            const f = fs.readFileSync(p).toString();
            const l = yaml.safeLoad(f);
            for (const str in texts) {
                if (!l[str]) {
                    if (result[str]) result[str].locale.push(locale);
                    else result[str] = { source: texts[str], locale: [locale] };
                }
            }
        }
    }
} else {
    const p = path.join(LOCALE_ROOT, name);
    const f = fs.readFileSync(p).toString();
    const l = yaml.safeLoad(f);
    for (const str in texts) {
        if (!l[str]) {
            result[str] = texts[str];
        }
    }
}
for (const str of IGNORE_MISSING) delete result[str];
console.log(`${Object.keys(result).length} translations missing.`);
fs.writeFileSync(path.join(__dirname, '..', '__result.json'), JSON.stringify(result, null, 2));
console.log(`Result wrote to ${path.resolve(__dirname, '..', '__result.json')}`);
