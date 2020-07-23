/* eslint-disable no-await-in-loop */
/* eslint-disable import/no-dynamic-require */
import { builtinModel } from './common';

export async function load(call) {
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
    const modelSystem = require('../model/system');
    const dbVer = await modelSystem.get('db.ver');
    if (dbVer !== 1) {
        const ins = require('../script/install');
        await ins.run({ username: 'Root', password: 'rootroot' });
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
    for (const postInit of global.Hydro.postInit) {
        try {
            await postInit();
        } catch (e) {
            console.error(e);
        }
    }
    return await modelSystem.get('server.worker');
}
