/* eslint-disable import/no-dynamic-require */
/* eslint-disable no-await-in-loop */
/* eslint-disable no-eval */
const fs = require('fs');
const os = require('os');
const zlib = require('zlib');
const path = require('path');
const yaml = require('js-yaml');

function root(name) {
    return path.resolve(process.cwd(), name);
}
function ensureDir(dir) {
    if (!fs.existsSync(dir)) {
        fs.mkdirSync(dir);
    } else if (!fs.statSync(dir).isDirectory()) {
        fs.unlinkSync(dir);
        fs.mkdirSync(dir);
    }
}

const active = [];
try {
    const f = require('../.build/builtin.json');
    const m = { ...yaml.safeLoad(zlib.gunzipSync(f.data)), id: 'builtin' };
    active.push(m);
} catch (e) {
    /* Ignore */
}

async function preload() {
    const files = fs.readdirSync(root('.build/module'));
    for (const file of files) {
        if (file.endsWith('.hydro')) {
            try {
                const f = fs.readFileSync(root(`.build/module/${file}`));
                const m = { ...yaml.safeLoad(zlib.gunzipSync(f)), id: file.split('.')[0] };
                active.push(m);
            } catch (e) {
                console.error(`Module Load Fail: ${file}`);
            }
        }
    }
    for (const i of active) {
        try {
            if (i.os) {
                if (!i.os.includes(os.platform())) throw new Error('Unsupported OS');
            }
            if (i.file) {
                i.files = {};
                ensureDir(path.resolve(os.tmpdir(), 'hydro', i.id));
                for (const n in i.file) {
                    if (i.file[n] === null) {
                        ensureDir(path.resolve(os.tmpdir(), 'hydro', i.id, n));
                    } else {
                        const e = path.resolve(os.tmpdir(), 'hydro', i.id, n);
                        fs.writeFileSync(e, Buffer.from(i.file[n], 'base64'), { mode: 755 });
                        i.files[n] = e;
                    }
                }
            }
        } catch (e) {
            console.error(`Module Load Fail: ${i.id}`);
            console.error(e);
        }
    }
}

async function handler() {
    for (const i of active) {
        if (i.handler) {
            try {
                console.time(`Handler init: ${i.id}`);
                const exports = {};
                // eslint-disable-next-line no-unused-vars
                const module = { exports, file: i.files || {} };
                eval(i.handler);
                console.timeEnd(`Handler init: ${i.id}`);
            } catch (e) {
                console.error(`Handler Load Fail: ${i.id}`);
            }
        }
    }
}

async function locale() {
    for (const i of active) {
        if (i.locale) {
            try {
                global.Hydro.lib.i18n(i.locale);
                console.log(`Locale init: ${i.id}`);
            } catch (e) {
                console.error(`Locale Load Fail: ${i.id}`);
            }
        }
    }
}

async function template() {
    for (const i of active) {
        if (i.template) {
            try {
                Object.assign(global.Hydro.template, i.template);
                console.log(`Template init: ${i.id}`);
            } catch (e) {
                console.error(`Template Load Fail: ${i.id}`);
            }
        }
    }
}

async function model() {
    for (const i of active) {
        if (i.model) {
            try {
                console.time(`Model init: ${i.id}`);
                const exports = {};
                const module = { exports, file: i.files || {} };
                eval(i.model);
                if ((module.exports || {}).index) await module.exports.index();
                console.timeEnd(`Model init: ${i.id}`);
            } catch (e) {
                console.error(`Model Load Fail: ${i.id}`);
            }
        }
    }
}

async function lib() {
    for (const i of active) {
        if (i.lib) {
            try {
                console.time(`Lib init: ${i.id}`);
                const exports = {};
                // eslint-disable-next-line no-unused-vars
                const module = { exports, file: i.files || {} };
                eval(i.lib);
                console.timeEnd(`Lib init: ${i.id}`);
            } catch (e) {
                console.error(`Lib Load Fail: ${i.id}`);
            }
        }
    }
}

async function service() {
    for (const i of active) {
        if (i.service) {
            try {
                console.time(`Service init: ${i.id}`);
                const exports = {}; // eslint-disable-line no-unused-vars
                const module = { exports };
                eval(i.service);
                if ((module.exports || {}).init) await module.exports.init();
                console.timeEnd(`Service init: ${i.id}`);
            } catch (e) {
                console.error(`Service Load Fail: ${i.id}`);
            }
        }
    }
}

async function install() {
    await Promise.all([lib(), locale(), template()]);
    require('./service/setup');
}

async function installDb() {
    const system = require('./model/system');
    const def = {
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
        'db.ver': 1,
        'listen.https': false,
        'listen.port': 8888,
        'session.keys': ['Hydro'],
        'session.secure': false,
        'session.saved_expire_seconds': 3600 * 24,
        'session.unsaved_expire_seconds': 600,
        changemail_token_expire_seconds: 3600 * 24,
        registration_token_expire_seconds: 600,
    };
    const tasks = [];
    for (const key in def) {
        tasks.push(system.set(key, def[key]));
    }
    await Promise.all(tasks);
}

async function load() {
    ensureDir(path.resolve(os.tmpdir(), 'hydro'));
    global.Hydro = {
        handler: {},
        service: {},
        model: {},
        lib: {},
        template: {},
        ui: {},
    };
    await preload();
    require('./lib/i18n');
    require('./utils');
    require('./error');
    require('./permission');
    try {
        require('./options');
    } catch (e) {
        await install();
        return;
    }
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
    await Promise.all([lib(), locale(), template()]);
    require('./service/gridfs');
    const server = require('./service/server');
    await server.prepare();
    await service();
    const builtinModel = [
        'blacklist', 'builtin', 'contest', 'discussion', 'message',
        'opcount', 'problem', 'record', 'setting', 'solution',
        'token', 'training', 'user',
    ];
    for (const i of builtinModel) {
        const m = require(`./model/${i}`);
        if (m.index) await m.index();
    }
    const system = require('./model/system');
    const dbVer = await system.get('db.ver');
    if (dbVer !== 1) await installDb();
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
    for (const i in global.Hydro.service) {
        if (global.Hydro.service[i].postInit) await global.Hydro.service[i].postInit();
    }
    await server.start();
}

module.exports = { load, active };
