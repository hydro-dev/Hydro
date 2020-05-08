const fs = require('fs');
const zlib = require('zlib');
const yaml = require('js-yaml');
const root = require('./root');
const template = require('./template');
const ignoreFailure = require('./ignoreFailure');

async function build(type) {
    if (!['development', 'production'].includes(type)) throw new Error(`Unknown type: ${type}`);
    ignoreFailure(fs.mkdirSync, root('.build'));
    ignoreFailure(fs.mkdirSync, root('.build/module'));
    const langs = fs.readdirSync(root('locales'));
    const lang = {};
    for (const i of langs) {
        const content = fs.readFileSync(root(`locales/${i}`)).toString();
        lang[i.split('.')[0]] = yaml.safeLoad(content);
    }
    const exclude = [
        'partials/training_default.json',
        'partials/problem_default.md',
        'bsod.html',
    ];
    const builtin = {};
    builtin.locale = lang;
    builtin.template = template('templates', exclude);
    const data = zlib.gzipSync(Buffer.from(yaml.safeDump(builtin)), { level: 3 });
    fs.writeFileSync(root('.build/module/builtin.hydro'), data);
    await require('./buildModule')(type);
    await require('./webpack')(type);
}

module.exports = build;

if (!module.parent) {
    build('development').catch((e) => {
        console.error(e);
    });
}
