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

async function preload() {
    const files = fs.readdirSync(root('.build/module'));
    for (const file of files) {
        if (file.endsWith('.hydro')) {
            try {
                const f = fs.readFileSync(root(`.build/module/${file}`));
                const m = { ...yaml.safeLoad(zlib.gunzipSync(f)), id: file.split('.')[0] };
                if (m.os) {
                    if (!m.os.includes(os.platform())) throw new Error('Unsupported OS');
                }
                if (m.file) {
                    m.files = {};
                    ensureDir(path.resolve(os.tmpdir(), 'hydro', file));
                    for (const n in m.file) {
                        const e = path.resolve(os.tmpdir(), 'hydro', file, n);
                        fs.writeFileSync(e, Buffer.from(m.file[n], 'base64'), { mode: 755 });
                        m.files[n] = e;
                    }
                }
                active.push(m);
            } catch (e) {
                console.error(`Module Load Fail: ${file}`);
            }
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
    await lib();
    await locale();
    require('./service/gridfs');
    const server = require('./service/server');
    await service();
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
    for (const i in global.Hydro.service) {
        if (global.Hydro.service[i].postInit) await global.Hydro.service[i].postInit();
    }
    server.start();
}

module.exports = { load, active };
