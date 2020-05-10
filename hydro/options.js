const fs = require('fs');
const os = require('os');
const path = require('path');
const yaml = require('js-yaml');
const { defaultsDeep } = require('lodash');

let options = {
    db: {
        name: 'hydro',
        host: '127.0.0.1',
        port: 27017,
        username: '',
        password: '',
    },
    template: {
        path: path.join(process.cwd(), 'templates'),
    },
    listen: {
        host: '127.0.0.1',
        port: 8888,
        domain: '',
        https: false,
    },
    smtp: {
        from: '',
        host: '',
        port: 465,
        user: '',
        pass: '',
        secure: false,
    },
    session: {
        keys: ['Hydro'],
        secure: false,
        domain: '127.0.0.1',
        saved_expire_seconds: 3600 * 24,
        unsaved_expire_seconds: 600,
        registration_token_expire_seconds: 600,
    },
    constants: {
        PROBLEM_PER_PAGE: 100,
        RECORD_PER_PAGE: 100,
        SOLUTION_PER_PAGE: 20,
        CONTEST_PER_PAGE: 20,
        TRAINING_PER_PAGE: 10,
        DISCUSSION_PER_PAGE: 50,
        REPLY_PER_PAGE: 50,
        CONTESTS_ON_MAIN: 5,
        TRAININGS_ON_MAIN: 5,
        DISCUSSIONS_ON_MAIN: 20,
    },
};

let f = path.resolve(process.cwd(), 'config.json');
if (!fs.existsSync(f)) f = path.resolve(os.homedir(), '.config', 'hydro', 'config.json');
if (!fs.existsSync(f)) f = path.resolve('/config/config.json');
const t = JSON.parse(fs.readFileSync(f));
options = defaultsDeep(t, options);

module.exports = options;
