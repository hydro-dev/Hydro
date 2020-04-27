const yaml = require('js-yaml');
const fs = require('fs');
const root = require('./root');
const build = async (next) => {
    let langs = fs.readdirSync(root('locales'));
    next({ total: langs.length });
    let lang = {};
    let count = 0;
    for (let i of langs) {
        const content = fs.readFileSync(root(`locales/${i}`)).toString();
        lang[i.split('.')[0]] = yaml.safeLoad(content);
        next({ progress: ++count });
    }
    fs.writeFileSync(root('.build/locales.json'), JSON.stringify(lang));
}
module.exports = build;
