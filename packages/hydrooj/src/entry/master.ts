/* eslint-disable no-await-in-loop */
/* eslint-disable import/no-dynamic-require */
import os from 'os';
import path from 'path';
import fs from 'fs-extra';
import { argv } from 'yargs';
import { builtinModel } from './common';
import { Entry } from '../loader';
import { Logger } from '../logger';
import options from '../options';
import * as bus from '../service/bus';
import db from '../service/db';
import storage from '../service/storage';

const logger = new Logger('entry/master');
const tmpdir = path.resolve(os.tmpdir(), 'hydro');
const lockfile = path.resolve(tmpdir, 'lock.json');

export async function load(call: Entry) {
    fs.ensureDirSync(tmpdir);
    if (fs.existsSync(lockfile) && !argv.ignorelock) {
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
    });
    const opts = options();
    await db.start(opts);
    const modelSystem = require('../model/system');
    await modelSystem.runConfig();
    if (process.env.MINIO_ACCESS_KEY && process.env.MINIO_SECRET_KEY) {
        await modelSystem.set('file.accessKey', process.env.MINIO_ACCESS_KEY);
        await modelSystem.set('file.secretKey', process.env.MINIO_SECRET_KEY);
        await modelSystem.set('file.endPoint', 'http://localhost:9000/');
    }
    const [endPoint, accessKey, secretKey, bucket, region, endPointForUser, endPointForJudge] = modelSystem.getMany([
        'file.endPoint', 'file.accessKey', 'file.secretKey', 'file.bucket', 'file.region',
        'file.endPointForUser', 'file.endPointForJudge',
    ]);
    const sopts = {
        endPoint, accessKey, secretKey, bucket, region, endPointForUser, endPointForJudge,
    };
    await storage.start(sopts);
    require('../service/monitor');
    for (const i of builtinModel) require(`../model/${i}`);
    const scripts = require('../upgrade');
    let dbVer = (await modelSystem.get('db.ver')) ?? 0;
    const isFresh = !dbVer;
    const expected = scripts.length;
    while (dbVer < expected) {
        logger.info('Upgrading database: from %d to %d', dbVer, expected);
        if (isFresh) {
            const func = scripts[dbVer].toString();
            if (func.includes('_FRESH_INSTALL_IGNORE')) continue;
        }
        const result = await scripts[dbVer]();
        if (!result) break;
        dbVer++;
        await modelSystem.set('db.ver', dbVer);
    }
    bus.serial('app/started');
    return await modelSystem.get('server.worker');
}
