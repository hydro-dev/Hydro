/* eslint-disable no-await-in-loop */
/* eslint-disable import/no-dynamic-require */
import os from 'os';
import path from 'path';
import fs from 'fs-extra';
import cac from 'cac';
import { builtinModel } from './common';
import { Entry } from '../loader';
import { Logger } from '../logger';
import options from '../options';
import * as bus from '../service/bus';
import db from '../service/db';

const argv = cac().parse();
const logger = new Logger('entry/master');
const tmpdir = path.resolve(os.tmpdir(), 'hydro');
const lockfile = path.resolve(tmpdir, 'lock.json');

export async function load(call: Entry) {
    fs.ensureDirSync(tmpdir);
    if (fs.existsSync(lockfile) && !argv.options.ignorelock) {
        try {
            const file = require(lockfile);
            process.kill(file.pid, 0);
            logger.error(`Lockfile exists, pid=${file.pid}`);
            process.exit(1);
        } catch {
            // Invalid lockfile or process not exist
        }
    }
    const context = {
        addons: global.addons,
        pid: process.pid,
        ppid: process.ppid,
    };
    await fs.writeFile(lockfile, JSON.stringify(context));
    require('../lib/i18n');
    require('../utils');
    require('../error');
    const config = require('../options')();
    if (!config) {
        logger.info('Starting setup');
        await call({ entry: 'setup', newProcess: true }).catch((err) => {
            logger.error('Cannot start setup process.', err);
            process.exit(1);
        });
    }
    bus.once('app/exit', () => {
        fs.removeSync(lockfile);
        fs.removeSync(path.resolve(os.tmpdir(), 'hydro', 'public'));
    });
    const opts = options();
    await db.start(opts);
    const modelSystem = require('../model/system');
    await modelSystem.runConfig();
    if (process.env.MINIO_ACCESS_KEY && process.env.MINIO_SECRET_KEY) {
        await modelSystem.set('file.accessKey', process.env.MINIO_ACCESS_KEY);
        await modelSystem.set('file.secretKey', process.env.MINIO_SECRET_KEY);
    }
    const storage = require('../service/storage');
    await storage.start();
    require('../service/monitor');
    for (const i of builtinModel) require(`../model/${i}`);
    const scripts = require('../upgrade').default;
    let dbVer = (await modelSystem.get('db.ver')) ?? 0;
    const isFresh = !dbVer;
    const expected = scripts.length;
    while (dbVer < expected) {
        logger.info('Upgrading database: from %d to %d', dbVer, expected);
        const func = scripts[dbVer];
        if (typeof func !== 'function' || (isFresh && func.toString().includes('_FRESH_INSTALL_IGNORE'))) {
            dbVer++;
            continue;
        }
        const result = await func();
        if (!result) break;
        dbVer++;
        await modelSystem.set('db.ver', dbVer);
    }
    await bus.serial('app/started');
    return typeof argv.options.worker === 'number'
        ? argv.options.worker
        : await modelSystem.get('server.worker');
}
