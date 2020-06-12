/* eslint-disable import/no-dynamic-require */
/* eslint-disable no-await-in-loop */
/* eslint-disable no-eval */
const fs = require('fs');
const os = require('os');
const path = require('path');
const cluster = require('cluster');
const numCPUs = require('os').cpus().length;

function ensureDir(dir) {
    if (!fs.existsSync(dir)) {
        fs.mkdirSync(dir);
    } else if (!fs.statSync(dir).isDirectory()) {
        fs.unlinkSync(dir);
        fs.mkdirSync(dir);
    }
}

let pending = [];
const active = [];
const fail = [];

async function handler() {
    for (const i of pending) {
        const p = `${os.tmpdir()}/hydro/tmp/${i}/handler.js`;
        if (fs.existsSync(p) && !fail.includes(i)) {
            try {
                console.log(`Handler init: ${i}`);
                console.time(`Handler init: ${i}`);
                eval('require')(p);
                console.timeEnd(`Handler init: ${i}`);
            } catch (e) {
                fail.push(i);
                console.error(`Handler Load Fail: ${i}`);
            }
        }
    }
}

async function locale() {
    for (const i of pending) {
        const p = `${os.tmpdir()}/hydro/tmp/${i}/locale.json`;
        if (fs.existsSync(p) && !fail.includes(i)) {
            try {
                global.Hydro.lib.i18n(eval('require')(p));
                console.log(`Locale init: ${i}`);
            } catch (e) {
                fail.push(i);
                console.error(`Locale Load Fail: ${i}`);
            }
        }
    }
}

async function template() {
    for (const i of pending) {
        const p = `${os.tmpdir()}/hydro/tmp/${i}/template.json`;
        if (fs.existsSync(p) && !fail.includes(i)) {
            try {
                Object.assign(global.Hydro.template, eval('require')(p));
                console.log(`Template init: ${i}`);
            } catch (e) {
                fail.push(i);
                console.error(`Template Load Fail: ${i}`);
            }
        }
    }
}

async function model() {
    for (const i of pending) {
        const p = `${os.tmpdir()}/hydro/tmp/${i}/model.js`;
        if (fs.existsSync(p) && !fail.includes(i)) {
            try {
                console.log(`Model init: ${i}`);
                console.time(`Model init: ${i}`);
                eval('require')(p);
                console.timeEnd(`Model init: ${i}`);
            } catch (e) {
                fail.push(i);
                console.error(`Model Load Fail: ${i}`);
            }
        }
    }
}

async function lib() {
    for (const i of pending) {
        const p = `${os.tmpdir()}/hydro/tmp/${i}/lib.js`;
        if (fs.existsSync(p) && !fail.includes(i)) {
            try {
                console.log(`Lib init: ${i}`);
                console.time(`Lib init: ${i}`);
                eval('require')(p);
                console.timeEnd(`Lib init: ${i}`);
            } catch (e) {
                fail.push(i);
                console.error(`Lib Load Fail: ${i}`);
            }
        }
    }
}

async function service() {
    for (const i of pending) {
        const p = `${os.tmpdir()}/hydro/tmp/${i}/service.js`;
        if (fs.existsSync(p) && !fail.includes(i)) {
            try {
                console.log(`Service init: ${i}`);
                console.time(`Service init: ${i}`);
                eval('require')(p);
                console.timeEnd(`Service init: ${i}`);
            } catch (e) {
                fail.push(i);
                console.error(`Service Load Fail: ${i}`);
                console.error(e);
            }
        }
    }
}

async function script() {
    for (const i of pending) {
        const p = `${os.tmpdir()}/hydro/tmp/${i}/script.js`;
        if (fs.existsSync(p) && !fail.includes(i)) {
            try {
                console.time(`Script init: ${i}`);
                eval('require')(p);
                console.timeEnd(`Script init: ${i}`);
            } catch (e) {
                fail.push(i);
                console.error(`Script Load Fail: ${i}`);
                console.error(e);
            }
        }
        active.push(i);
    }
}

async function install() {
    const setup = require('./service/setup');
    await setup.setup();
}

const builtinLib = [
    'axios', 'download', 'i18n', 'mail', 'markdown',
    'md5', 'misc', 'paginate', 'hash.hydro', 'rank',
    'template', 'validator', 'nav', 'sysinfo',
];

const builtinModel = [
    'builtin', 'document', 'domain', 'blacklist', 'opcount',
    'setting', 'token', 'user', 'problem', 'record',
    'contest', 'message', 'solution', 'training', 'file',
    'discussion', 'system',
];

const builtinHandler = [
    'home', 'problem', 'record', 'judge', 'user',
    'contest', 'training', 'discussion', 'manage', 'import',
    'misc', 'homework', 'domain', 'wiki',
];

const builtinScript = [
    'install', 'uninstall', 'rating', 'recalcRating', 'register',
    'blacklist', 'setSuperadmin',
];

async function loadAsMaster() {
    ensureDir(path.resolve(os.tmpdir(), 'hydro'));
    ensureDir(path.resolve(os.tmpdir(), 'hydro', 'tmp'));
    ensureDir(path.resolve(os.tmpdir(), 'hydro', 'public'));
    // TODO better run in another process as this needs lots of memory
    require('./unzip')();
    pending = await require('./lib/hpm').getInstalled();
    require('./lib/i18n');
    require('./utils');
    require('./error');
    require('./permission');
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
    for (const i of builtinLib) require(`./lib/${i}`);
    await lib();
    require('./service/gridfs');
    require('./service/monitor');
    const server = require('./service/server');
    await server.prepare();
    await service();
    for (const i of builtinModel) require(`./model/${i}`);
    for (const i of builtinHandler) require(`./handler/${i}`);
    await model();
    for (const m in global.Hydro.model) {
        if (global.Hydro.model[m].ensureIndexes) {
            await global.Hydro.model[m].ensureIndexes();
        }
    }
    const system = require('./model/system');
    const dbVer = await system.get('db.ver');
    if (dbVer !== 1) {
        const ins = require('./script/install');
        await ins.run({ username: 'Root', password: 'rootroot' });
    }
    await handler();
    for (const i in global.Hydro.handler) {
        await global.Hydro.handler[i]();
    }
    for (const i in global.Hydro.service) {
        if (global.Hydro.service[i].postInit) {
            try {
                await global.Hydro.service[i].postInit();
            } catch (e) {
                console.error(e);
            }
        }
    }
    for (const i of builtinScript) require(`./script/${i}`);
    await script();
    pending = [];
}

async function loadAsWorker() {
    pending = await require('./lib/hpm').getInstalled();
    require('./lib/i18n');
    require('./utils');
    require('./error');
    require('./permission');
    require('./options');
    await Promise.all([locale(), template()]);
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
    for (const i of builtinLib) require(`./lib/${i}`);
    await lib();
    require('./service/gridfs');
    const server = require('./service/server');
    await server.prepare();
    await service();
    for (const i of builtinModel) require(`./model/${i}`);
    for (const i of builtinHandler) require(`./handler/${i}`);
    await model();
    await handler();
    for (const i in global.Hydro.handler) {
        await global.Hydro.handler[i]();
    }
    const notfound = require('./handler/notfound');
    await notfound();
    for (const i in global.Hydro.service) {
        if (global.Hydro.service[i].postInit) {
            try {
                await global.Hydro.service[i].postInit();
            } catch (e) {
                console.error(e);
            }
        }
    }
    for (const i of builtinScript) require(`./script/${i}`);
    await script();
    pending = [];
    await server.start();
}

async function terminate() {
    for (const task of global.onDestory) {
        // eslint-disable-next-line no-await-in-loop
        await task();
    }
    process.exit(0);
}

async function load() {
    global.nodeModules = {
        bson: require('bson'),
        'js-yaml': require('js-yaml'),
        mongodb: require('mongodb'),
    };
    global.Hydro = {
        handler: {},
        service: {},
        model: {},
        script: {},
        lib: {},
        wiki: {},
        template: {},
        ui: {},
    };
    global.onDestory = [];
    Error.stackTraceLimit = 50;
    process.on('unhandledRejection', (e) => console.error(e));
    process.on('SIGINT', terminate);
    if (cluster.isMaster) {
        console.log(`Master ${process.pid} Starting`);
        process.stdin.setEncoding('utf8');
        process.stdin.on('data', async (input) => {
            try {
                const t = eval(input.toString().trim()); // eslint-disable-line no-eval
                if (t instanceof Promise) console.log(await t);
                else console.log(t);
            } catch (e) {
                console.warn(e);
            }
        });
        await loadAsMaster();
        cluster.on('exit', (worker, code, signal) => {
            console.log(`Worker ${worker.process.pid} exit: ${code} ${signal}`);
        });
        cluster.on('disconnect', (worker) => {
            console.log(`Worker ${worker.process.pid} disconnected`);
        });
        cluster.on('listening', (worker, address) => {
            console.log(`Worker ${worker.process.pid} listening at `, address);
        });
        cluster.on('online', (worker) => {
            console.log(`Worker ${worker.process.pid} is online`);
        });
        for (let i = 0; i < numCPUs; i++) {
            cluster.fork();
        }
    } else {
        console.log(`Worker ${process.pid} Starting`);
        await loadAsWorker();
        console.log(`Worker ${process.pid} Started`);
    }
    if (global.gc) global.gc();
}

module.exports = {
    load, pending, active, fail,
};

if (!module.parent) {
    load().catch((e) => {
        console.error(e);
        process.exit(1);
    });
}
