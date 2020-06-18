/* eslint-disable no-await-in-loop */
/* eslint-disable import/no-dynamic-require */
const os = require('os');
const fs = require('fs');
const path = require('path');
const {
    lib, service, model, setting,
    builtinLib, builtinHandler, builtinModel,
} = require('./common');

function ensureDir(dir) {
    if (!fs.existsSync(dir)) {
        fs.mkdirSync(dir);
    } else if (!fs.statSync(dir).isDirectory()) {
        fs.unlinkSync(dir);
        fs.mkdirSync(dir);
    }
}

async function load(call) {
    ensureDir(path.resolve(os.tmpdir(), 'hydro'));
    ensureDir(path.resolve(os.tmpdir(), 'hydro', 'tmp'));
    ensureDir(path.resolve(os.tmpdir(), 'hydro', 'public'));
    await call({ entry: 'unzip', newProcess: true });
    let pending = await require('../lib/hpm').getInstalled();
    const fail = [];
    require('../lib/i18n');
    require('../utils');
    require('../error');
    require('../permission');
    try {
        require('../options');
    } catch (e) {
        await call({ entry: 'install' });
        require('../options');
    }
    const bus = require('../service/bus');
    await new Promise((resolve) => {
        const h = () => {
            console.log('Database connected');
            bus.unsubscribe(['system_database_connected'], h);
            resolve();
        };
        bus.subscribe(['system_database_connected'], h);
        require('../service/db');
    });
    for (const i of builtinLib) require(`../lib/${i}`);
    await lib(pending, fail);
    require('../service/gridfs');
    require('../service/monitor');
    const server = require('../service/server');
    await server.prepare();
    await service(pending, fail);
    for (const i of builtinModel) require(`../model/${i}`);
    for (const i of builtinHandler) require(`../handler/${i}`);
    await model(pending, fail);
    for (const m in global.Hydro.model) {
        if (global.Hydro.model[m].ensureIndexes) {
            await global.Hydro.model[m].ensureIndexes();
        }
    }
    const modelSystem = require('../model/system');
    const modelSetting = require('../model/setting');
    const dbVer = await modelSystem.get('db.ver');
    if (dbVer !== 1) {
        const ins = require('../script/install');
        await ins.run({ username: 'Root', password: 'rootroot' });
    }
    await setting(pending, fail, modelSetting, modelSystem);
    for (const i in global.Hydro.service) {
        if (global.Hydro.service[i].postInit) {
            try {
                await global.Hydro.service[i].postInit();
            } catch (e) {
                console.error(e);
            }
        }
    }
    pending = [];
    return await modelSystem.get('server.worker');
}

module.exports = load;
