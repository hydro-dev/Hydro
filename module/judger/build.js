const fs = require('fs');
const path = require('path');
const child = require('child_process');

exports.prebuild = async function prebuild() {
    if (!fs.existsSync(path.resolve(__dirname, 'HydroJudger'))) {
        const res = child.spawnSync('git clone https://github.com/hydro-dev/HydroJudger.git');
        if (res.error) throw res.error;
    }
};
