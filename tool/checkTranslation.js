/* eslint-disable no-eval */
const fs = require('fs');
const path = require('path');
const yaml = require('js-yaml');

const name = process.argv[2];

const IGNORE_CHECK = ['en'];
const IGNORE_MISSING = [
    '?', 'AC', 'Gravatar', 'ID', 'MD5', 'URL',
];
const RE_TEMPLATE = /_\(['"]([\s\S])*?['"]\)/gmi;
const RE_UI = /i18n\(['"]([\s\S])*?['"](,.*?)?\)/gmi;
const RE_SETTING = /Setting\(['"]([\s\S])*?['"](,[^()]*?)\)/gmi;
const TEMPLATE_ROOT = path.resolve(__dirname, '..', 'templates');
const LOCALE_ROOT = path.resolve(__dirname, '..', 'locales');
const UI_ROOT = path.resolve(__dirname, '..', 'ui');
const IGNORE_NAME = ['node_modules'];
const texts = {};
const result = {};
const locales = fs.readdirSync(LOCALE_ROOT);
let currentFile = '';

// eslint-disable-next-line @typescript-eslint/no-unused-vars
function _(str, format) {
    if (!texts[str]) texts[str] = [currentFile];
    else texts[str].push(currentFile);
}
// eslint-disable-next-line @typescript-eslint/no-unused-vars
const i18n = _;
// eslint-disable-next-line @typescript-eslint/no-unused-vars
const Setting = _;

function scanTemplate(folder, relative = 'templates') {
    const files = fs.readdirSync(folder);
    for (const file of files) {
        if (!IGNORE_NAME.includes(file)) {
            const p = path.join(folder, file);
            if (fs.statSync(p).isDirectory()) {
                scanTemplate(p, path.join(relative, file));
            } else {
                currentFile = path.join(relative, file);
                const f = fs.readFileSync(p).toString();
                f.replace(RE_TEMPLATE, (substr) => {
                    try {
                        // eslint-disable-next-line no-eval
                        eval(substr);
                    } catch (e) {
                        console.error('Cannot parse: ', substr, ' in file ', p);
                    }
                });
            }
        }
    }
}
function scanUi(folder, relative = 'ui') {
    const files = fs.readdirSync(folder);
    for (const file of files) {
        if (!IGNORE_NAME.includes(file)) {
            const p = path.join(folder, file);
            if (fs.statSync(p).isDirectory()) {
                scanUi(p, path.join(relative, file));
            } else {
                currentFile = path.join(relative, file);
                const f = fs.readFileSync(p).toString();
                f.replace(RE_UI, (substr) => {
                    try {
                        eval(substr);
                    } catch (e) {
                        if (e.message.endsWith('is not defined')) {
                            global[e.message.split(' ')[0]] = () => { };
                            try {
                                eval(substr);
                            } catch (err) {
                                console.error('Cannot parse: ', substr, ' in file ', p);
                            }
                        } else console.error('Cannot parse: ', substr, ' in file ', p);
                    }
                });
            }
        }
    }
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
scanTemplate(TEMPLATE_ROOT);
scanUi(UI_ROOT);
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
