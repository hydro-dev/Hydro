/* eslint-disable import/no-dynamic-require */
/* eslint-disable no-await-in-loop */
import os from 'os';
import path from 'path';
import cac from 'cac';
import fs from 'fs-extra';
import { Logger } from '../logger';
import options from '../options';
import * as bus from '../service/bus';
import db from '../service/db';
import { Runtime } from '../service/module';
import {
    handler, lib, locale, model, script, service, setting, template,
} from './common';

const logger = new Logger('worker');
const { loaderDetail: detail, watch } = cac().parse().options;
const tmpdir = path.resolve(os.tmpdir(), 'hydro');

export async function load() {
    fs.ensureDirSync(tmpdir);
    require('../lib/i18n');
    require('../utils');
    require('../error');
    const config = require('../options')();
    if (!process.env.CI && !config) {
        logger.info('Starting setup');
        return require('./setup').load();
    }
    const pending = global.addons;
    const fail = [];
    if (detail) logger.info('start');
    await Promise.all([
        locale(pending, fail),
        template(pending, fail),
    ]);
    if (detail) logger.info('finish: locale/template/static');
    const opts = options();
    await db.start(opts);
    await require('../settings').loadConfig();
    if (detail) logger.info('finish: db.connect');
    const modelSystem = require('../model/system');
    await modelSystem.runConfig();
    if (detail) logger.info('finish: config');
    const storage = require('../service/storage');
    await storage.loadStorageService();
    if (detail) logger.info('finish: storage.connect');
    require('../lib/index');
    if (detail) logger.info('finish: lib.builtin');
    await lib(pending, fail);
    if (detail) logger.info('finish: lib.extra');
    require('../service/monitor');
    if (detail) logger.info('finish: monitor');
    const server = require('../service/server');
    await server.prepare();
    if (detail) logger.info('finish: server');
    if (watch) require('../service/watcher');
    await service(pending, fail);
    if (detail) logger.info('finish: service.extra');
    require('../model/index');
    if (detail) logger.info('finish: model.builtin');
    const handlerDir = path.resolve(__dirname, '..', 'handler');
    const handlers = await fs.readdir(handlerDir);
    for (const h of handlers) {
        const f = path.resolve(handlerDir, h);
        const m = require(f);
        if (m.apply) new Runtime(f).load(m);
    }
    if (detail) logger.info('finish: handler.builtin');
    await model(pending, fail);
    if (detail) logger.info('finish: model.extra');
    const modelSetting = require('../model/setting');
    await setting(pending, fail, modelSetting);
    if (detail) logger.info('finish: setting');
    await handler(pending, fail);
    if (detail) logger.info('finish: handler.extra');
    for (const i in global.Hydro.handler) await global.Hydro.handler[i]();
    if (detail) logger.info('finish: handler.apply');
    require('../script/index');
    if (detail) logger.info('finish: script.builtin');
    await script(pending, fail);
    if (detail) logger.info('finish: script.extra');
    await bus.serial('app/started');
    if (detail) logger.info('finish: bus.serial(start)');
    await server.start();
    if (detail) logger.info('finish: server.start');
    if (process.env.NODE_APP_INSTANCE === '0') {
        const scripts = require('../upgrade').default;
        let dbVer = (await modelSystem.get('db.ver')) ?? 0;
        const isFresh = !dbVer;
        const expected = scripts.length;
        while (dbVer < expected) {
            const func = scripts[dbVer];
            if (typeof func !== 'function' || (isFresh && func.toString().includes('_FRESH_INSTALL_IGNORE'))) {
                dbVer++;
                continue;
            }
            logger.info('Upgrading database: from %d to %d', dbVer, expected);
            const result = await func();
            if (!result) break;
            dbVer++;
            await modelSystem.set('db.ver', dbVer);
        }
    }
    logger.success('Server started');
    process.send?.('ready');
    await bus.serial('app/ready');
    return { fail };
}
