const fs = require('fs');
const path = require('path');

exports.prebuild = async function prebuild() {
    if (!fs.existsSync(path.resolve(__dirname, 'file', 'executorserver'))) {
        if (!fs.existsSync(path.resolve(__dirname, 'file'))) {
            fs.mkdirSync(path.resolve(__dirname, 'file'));
        }
        // TODO download executorserver
    }
};
