const fs = require('fs');
const os = require('os');
const path = require('path');
const { defaults } = require('lodash');

let options = {
    name: 'hydro',
    host: '127.0.0.1',
    port: 27017,
    username: '',
    password: '',
};

let f = path.resolve(process.cwd(), 'config.json');
if (!fs.existsSync(f)) f = path.resolve(os.homedir(), '.config', 'hydro', 'config.json');
if (!fs.existsSync(f)) f = path.resolve('/config/config.json');
const t = JSON.parse(fs.readFileSync(f));
options = defaults(t, options);

module.exports = options;
