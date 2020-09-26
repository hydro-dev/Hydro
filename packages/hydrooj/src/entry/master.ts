/* eslint-disable no-await-in-loop */
/* eslint-disable import/no-dynamic-require */
import os from 'os';
import path from 'path';
import fs from 'fs-extra';
import pslist from 'ps-list';
import { argv } from 'yargs';
import { builtinModel } from './common';
import { Entry } from '../loader';
import { Logger } from '../logger';
import * as bus from '../service/bus';

const logger = new Logger('entry/master');
const tmpdir = path.resolve(os.tmpdir(), 'hydro');
const lockfile = path.resolve(tmpdir, 'lock.json');

export async function load(call: Entry) {
    fs.ensureDirSync(tmpdir);
    if (fs.existsSync(lockfile) && !argv.ignorelock) {
        try {
            const file = require(lockfile);
            const plist = await pslist();
            if (file.pid && plist.map((i) => i.pid).includes(file.pid)) {
                logger.error(`Lockfile exists, pid=${file.pid}`);
                process.exit(1);
            }
        } catch {
            // Invalid lockfile. ignore.
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
    await new Promise((resolve) => {
        bus.once('database/connect', () => {
            bus.once('database/config', resolve);
            require('../model/system');
        });
        require('../service/db');
    });
    require('../service/monitor');
    for (const i of builtinModel) require(`../model/${i}`);
    const modelSystem = require('../model/system');
    const dbVer = await modelSystem.get('db.ver');
    if (dbVer !== 1) {
        const ins = require('../script/upgrade0_1');
        await ins.run({ username: 'Root', password: 'rootroot' });
    }
    bus.serial('app/started');
    return await modelSystem.get('server.worker');
}
