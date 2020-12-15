/* eslint-disable no-await-in-loop */
/* eslint-disable import/no-dynamic-require */
import {
    locale, template, lib, service, model, handler, script, setting, uistatic,
    builtinLib, builtinScript, builtinHandler, builtinModel,
} from './common';
import options from '../options';
import * as bus from '../service/bus';
import db from '../service/db';

export async function load() {
    const pending = global.addons;
    const fail = [];
    const active = [];
    require('../lib/i18n');
    require('../utils');
    require('../error');
    require('../options');
    await Promise.all([
        locale(pending, fail),
        template(pending, fail),
        uistatic(pending, fail),
    ]);
    const opts = options();
    await db.start(opts);
    await new Promise((resolve) => {
        bus.once('database/config', resolve);
        require('../model/system');
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
    const modelSetting = require('../model/setting');
    await setting(pending, fail, modelSetting);
    await handler(pending, fail);
    for (const i in global.Hydro.handler) {
        await global.Hydro.handler[i]();
    }
    const notfound = require('../handler/notfound');
    await notfound.apply();
    for (const i of builtinScript) require(`../script/${i}`);
    await script(pending, fail, active);
    await bus.serial('app/started');
    await server.start();
    setInterval(() => {
        process.send({ event: 'stat', count: global.Hydro.stat.reqCount });
        global.Hydro.stat.reqCount = 0;
    }, 30 * 1000);
    return { active, fail };
}
