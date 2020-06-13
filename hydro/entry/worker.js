/* eslint-disable no-await-in-loop */
/* eslint-disable import/no-dynamic-require */
const {
    locale, template, lib, service, model, handler, script,
    builtinLib, builtinScript, builtinHandler, builtinModel,
} = require('./common');

async function load() {
    let pending = await require('../lib/hpm').getInstalled();
    const fail = [];
    const active = [];
    require('../lib/i18n');
    require('../utils');
    require('../error');
    require('../permission');
    require('../options');
    await Promise.all([locale(pending, fail), template(pending, fail)]);
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
    const server = require('../service/server');
    await server.prepare();
    await service(pending, fail);
    for (const i of builtinModel) require(`../model/${i}`);
    for (const i of builtinHandler) require(`../handler/${i}`);
    await model(pending, fail);
    await handler(pending, fail);
    for (const i in global.Hydro.handler) {
        await global.Hydro.handler[i]();
    }
    const notfound = require('../handler/notfound');
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
    for (const i of builtinScript) require(`../script/${i}`);
    await script(pending, fail, active);
    pending = [];
    await server.start();
    return { active, fail };
}

module.exports = load;
