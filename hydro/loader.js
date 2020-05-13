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
const fail = [];
try {
    // Let webpack pack builtin module together.
    // eslint-disable-next-line import/no-unresolved
    const f = require('../.build/builtin.json');
    const m = { ...yaml.safeLoad(zlib.gunzipSync(f.data)), id: 'builtin' };
    active.push(m);
} catch (e) {
    // Builtin module is in the module directory
}

const moduleRoots = [
    root('.build/module'),
    root('module'),
    root(path.resolve(os.homedir(), '.hydro', 'module')),
    root('.'),
];
let moduleRoot;
for (const i of moduleRoots) {
    if (fs.existsSync(i) && fs.statSync(i).isDirectory()) {
        moduleRoot = i;
        break;
    }
}

async function preload() {
    const files = fs.readdirSync(moduleRoot);
    for (const file of files) {
        if (file.endsWith('.hydro')) {
            try {
                const f = fs.readFileSync(root(`${moduleRoot}/${file}`));
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
                if (!i.os.includes(os.platform().toLowerCase())) throw new Error('Unsupported OS');
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
            i.fail = true;
            fail.push(i.id);
            console.error(`Module Load Fail: ${i.id}`);
            console.error(e);
        }
    }
}

async function handler() {
    for (const i of active) {
        if (i.handler && !i.fail) {
            try {
                console.log(`Handler init: ${i.id}`);
                console.time(`Handler init: ${i.id}`);
                const exports = {};
                // eslint-disable-next-line no-unused-vars
                const module = { exports, file: i.files || {} };
                eval(i.handler);
                console.timeEnd(`Handler init: ${i.id}`);
            } catch (e) {
                i.fail = true;
                fail.push(i.id);
                console.error(`Handler Load Fail: ${i.id}`);
            }
        }
    }
}

async function locale() {
    for (const i of active) {
        if (i.locale && !i.fail) {
            try {
                global.Hydro.lib.i18n(i.locale);
                console.log(`Locale init: ${i.id}`);
            } catch (e) {
                i.fail = true;
                fail.push(i.id);
                console.error(`Locale Load Fail: ${i.id}`);
            }
        }
    }
}

async function template() {
    for (const i of active) {
        if (i.template && !i.fail) {
            try {
                Object.assign(global.Hydro.template, i.template);
                console.log(`Template init: ${i.id}`);
            } catch (e) {
                i.fail = true;
                fail.push(i.id);
                console.error(`Template Load Fail: ${i.id}`);
            }
        }
    }
}

async function model() {
    for (const i of active) {
        if (i.model && !i.fail) {
            try {
                console.log(`Model init: ${i.id}`);
                console.time(`Model init: ${i.id}`);
                const exports = {};
                const module = { exports, file: i.files || {} };
                eval(i.model);
                if ((module.exports || {}).index) await module.exports.index();
                console.timeEnd(`Model init: ${i.id}`);
            } catch (e) {
                i.fail = true;
                fail.push(i.id);
                console.error(`Model Load Fail: ${i.id}`);
            }
        }
    }
}

async function lib() {
    for (const i of active) {
        if (i.lib && !i.fail) {
            try {
                console.log(`Lib init: ${i.id}`);
                console.time(`Lib init: ${i.id}`);
                const exports = {};
                // eslint-disable-next-line no-unused-vars
                const module = { exports, file: i.files || {} };
                eval(i.lib);
                console.timeEnd(`Lib init: ${i.id}`);
            } catch (e) {
                i.fail = true;
                fail.push(i.id);
                console.error(`Lib Load Fail: ${i.id}`);
            }
        }
    }
}

async function service() {
    for (const i of active) {
        if (i.service && !i.fail) {
            try {
                console.time(`Service init: ${i.id}`);
                const exports = {}; // eslint-disable-line no-unused-vars
                const module = { exports };
                eval(i.service);
                if ((module.exports || {}).init) await module.exports.init();
                console.timeEnd(`Service init: ${i.id}`);
            } catch (e) {
                i.fail = true;
                fail.push(i.id);
                console.error(`Service Load Fail: ${i.id}`);
                console.error(e);
            }
        }
    }
}

async function install() {
    const setup = require('./service/setup');
    await setup.setup();
}

async function load() {
    ensureDir(path.resolve(os.tmpdir(), 'hydro'));
    global.Hydro = {
        handler: {},
        service: {},
        model: {},
        script: {},
        lib: {},
        nodeModules: {
            mongodb: require('mongodb'),
        },
        template: {},
        ui: {},
    };
    await preload();
    require('./lib/i18n');
    require('./utils');
    require('./error');
    require('./permission');
    await Promise.all([locale(), template()]);
    try {
        require('./options');
    } catch (e) {
        await install();
        require('./options');
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
    await lib();
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
    if (dbVer !== 1) {
        const ins = require('./script/install');
        await ins.run();
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
    await server.start();
}

module.exports = { load, active, fail };
