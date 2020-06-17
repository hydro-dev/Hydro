/* eslint-disable no-await-in-loop */
/* eslint-disable no-eval */
const os = require('os');
const fs = require('fs');

const builtinLib = [
    'axios', 'download', 'i18n', 'mail', 'markdown',
    'md5', 'misc', 'paginate', 'hash.hydro', 'rank',
    'template', 'validator', 'nav', 'sysinfo', 'testdata.convert.ini',
    'readConfig', 'logger',
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

async function handler(pending, fail) {
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

async function locale(pending, fail) {
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

async function config(pending, fail, system) {
    for (const i of pending) {
        const p = `${os.tmpdir()}/hydro/tmp/${i}/config.js`;
        if (fs.existsSync(p) && !fail.includes(i)) {
            try {
                global.Hydro.config[i] = eval('require')(p);
                for (const key in global.Hydro.config[i]) {
                    if (global.Hydro.config[i][key].default) {
                        const current = await system.get(`${i}.${key}`);
                        if (!current) await system.set(`${i}.${key}`, global.Hydro.config[i][key].default);
                    }
                }
            } catch (e) {
                console.error(`Config Load Fail: ${i}`);
            }
        }
    }
}

async function template(pending, fail) {
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

async function model(pending, fail) {
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

async function lib(pending, fail) {
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
                console.error(e);
            }
        }
    }
}

async function service(pending, fail) {
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

async function script(pending, fail, active) {
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

module.exports = {
    builtinLib,
    builtinModel,
    builtinHandler,
    builtinScript,
    handler,
    lib,
    locale,
    model,
    script,
    service,
    template,
    config,
};
