/* eslint-disable import/no-dynamic-require */
/* eslint-disable no-await-in-loop */
/* eslint-disable no-eval */
const fs = require('fs');
const zlib = require('zlib');
const path = require('path');
const yaml = require('js-yaml');

function root(name) {
    return path.resolve(process.cwd(), name);
}

const active = [];

async function preload() {
    const files = fs.readdirSync(root('.build/module'));
    for (const file of files) {
        if (file.endsWith('.hydro')) {
            const f = fs.readFileSync(root(`.build/module/${file}`));
            active.push({ ...yaml.safeLoad(zlib.gunzipSync(f)), id: file.split('.')[0] });
        }
    }
}

async function handler() {
    for (const i of active) {
        if (i.handler) {
            console.time(`Handler init: ${i.id}`);
            const module = {}; // eslint-disable-line no-unused-vars
            const exports = {}; // eslint-disable-line no-unused-vars
            eval(i.handler);
            console.timeEnd(`Handler init: ${i.id}`);
        }
    }
}

async function locale() {
    for (const i of active) {
        if (i.locale) {
            global.Hydro.lib.i18n(i.locale);
            console.log(`Locale init: ${i.id}`);
        }
    }
}

async function template() {
    for (const i of active) {
        if (i.template) {
            Object.assign(global.Hydro.template, i.template);
            console.log(`Template init: ${i.id}`);
        }
    }
}

async function model() {
    for (const i of active) {
        if (i.model) {
            console.time(`Model init: ${i.id}`);
            const module = {};
            const exports = {}; // eslint-disable-line no-unused-vars
            eval(i.handler);
            if ((module.exports || {}).index) await module.exports.index();
            console.timeEnd(`Model init: ${i.id}`);
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
    await preload();
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
        if (m.index) await m.index();
    }
    const builtinHandler = [
        'home', 'problem', 'record', 'judge', 'user',
        'contest', 'training', 'discussion', 'manage', 'import',
    ];
    for (const i of builtinHandler) require(`./handler/${i}`);
    await model();
    await handler();
    for (const i in global.Hydro.handler) {
        await global.Hydro.handler[i].apply();
    }
    const notfound = require('./handler/notfound');
    await notfound.apply();
    server.start();
}

module.exports = { load, active };
