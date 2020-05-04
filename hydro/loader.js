/* eslint-disable import/no-dynamic-require */
const fs = require('fs');
const path = require('path');
const yaml = require('js-yaml');

function root(name) {
    return path.resolve(process.cwd(), name);
}
const installed = fs.readdirSync(root('.build/module'));
function exist(name) {
    try {
        fs.statSync(root(name));
    } catch (e) {
        return false;
    }
    return true;
}
const superRequire = (name) => {
    let m;
    try {
        m = require(root(name));
    } catch (e) {
        m = __non_webpack_require__(root(name)); // eslint-disable-line no-undef
    }
    return m;
};

async function handler() {
    for (const i of installed) {
        if (exist(`.build/module/${i}/handler.js`)) {
            superRequire(`.build/module/${i}/handler.js`);
            console.log(`Handler init: ${i}`);
        }
    }
}

async function locale() {
    if (exist('.build/locale.json')) {
        global.Hydro.lib.i18n(superRequire('.build/locale.json'));
        console.log('Locale init: builtin');
    }
    for (const i of installed) {
        if (exist(`.build/module/${i}/locale.json`)) {
            global.Hydro.lib.i18n(superRequire(`.build/module/${i}/locale.json`));
            console.log(`Locale init: ${i}`);
        }
    }
}

async function template() {
    if (exist('.build/template.yaml')) {
        const file = fs.readFileSync(root('.build/template.yaml')).toString();
        Object.assign(global.Hydro.template, yaml.safeLoad(file));
        console.log('Template init: builtin');
    }
    for (const i of installed) {
        if (exist(`.build/module/${i}/template.yaml`)) {
            const file = fs.readFileSync(root(`.build/module/${i}/template.yaml`)).toString();
            Object.assign(global.Hydro.template, yaml.safeLoad(file));
            console.log(`Template init: ${i}`);
        }
    }
}

async function model() {
    for (const i of installed) {
        if (exist(`.build/module/${i}/model.js`)) {
            const m = superRequire(`.build/module/${i}/model.js`);
            if (m.index) await m.index(); // eslint-disable-line no-await-in-loop
            console.log(`Model init: ${i}`);
        }
    }
}

async function load() {
    global.Hydro = {
        handler: {},
        service: {},
        model: {},
        lib: {},
        template: {},
        ui: {},
    };
    await template();
    require('./lib/i18n');
    require('./utils');
    require('./error');
    require('./permission');
    require('./options');
    const bus = require('./service/bus');
    await new Promise((resolve) => {
        const h = () => {
            console.log('Database connected');
            bus.unsubscribe(['system_database_connected'], h);
            resolve();
        };
        bus.subscribe(['system_database_connected'], h);
        require('./service/db');
    });
    const builtinLib = [
        'axios', 'download', 'i18n', 'mail', 'markdown',
        'md5', 'misc', 'paginate', 'pwhash', 'rank',
        'template', 'validator', 'nav',
    ];
    for (const i of builtinLib) require(`./lib/${i}`);
    await locale();
    require('./service/gridfs');
    require('./service/queue');
    const server = require('./service/server');
    const builtinModel = [
        'blacklist', 'builtin', 'contest', 'discussion', 'message',
        'opcount', 'problem', 'record', 'setting', 'solution',
        'system', 'token', 'training', 'user',
    ];
    for (const i of builtinModel) {
        const m = require(`./model/${i}`);
        if (m.index) await m.index(); // eslint-disable-line no-await-in-loop
    }
    const builtinHandler = [
        'home', 'problem', 'record', 'judge', 'user',
        'contest', 'training', 'discussion', 'manage', 'import',
    ];
    for (const i of builtinHandler) require(`./handler/${i}`);
    await model();
    await handler();
    for (const i in global.Hydro.handler) {
        await global.Hydro.handler[i].apply(); // eslint-disable-line no-await-in-loop
    }
    const notfound = require('./handler/notfound');
    await notfound.apply();
    server.start();
}

module.exports = load;
