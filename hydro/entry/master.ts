/* eslint-disable no-await-in-loop */
/* eslint-disable import/no-dynamic-require */
import {
    lib, service, model, setting,
    builtinLib, builtinHandler, builtinModel,
} from './common';

export async function load(call, args) {
    let pending = args;
    const fail = [];
    require('../lib/i18n');
    require('../utils');
    require('../error');
    try {
        require('../options').default();
    } catch (e) {
        await call({ entry: 'setup', newProcess: true });
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
    require('../service/monitor');
    for (const i of builtinModel) require(`../model/${i}`);
    for (const i of builtinHandler) require(`../handler/${i}`);
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
    await setting(pending, fail, modelSetting);
    for (const i in global.Hydro.service) {
        if (global.Hydro.service[i].postInit) {
            try {
                await global.Hydro.service[i].postInit();
            } catch (e) {
                console.error(e);
            }
        }
    }
    for (const postInit of global.Hydro.postInit) {
        try {
            await postInit();
        } catch (e) {
            console.error(e);
        }
    }
    pending = [];
    return await modelSystem.get('server.worker');
}
