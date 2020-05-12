const fs = require('fs');
const path = require('path');
const child = require('child_process');
const yaml = require('js-yaml');

exports.prebuild = async function prebuild() {
    if (!fs.existsSync(path.resolve(__dirname, 'HydroJudger'))) {
        const res = child.spawnSync('git clone https://github.com/hydro-dev/HydroJudger.git');
        if (res.error) throw res.error;
    }
    let lang = fs.readFileSync(path.resolve(__dirname, 'langs.yaml')).toString();
    lang = yaml.safeLoad(lang);
    fs.writeFileSync(path.resolve(__dirname, '__lang.json'), JSON.stringify(lang));
};
