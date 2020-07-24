/* eslint-disable no-await-in-loop */
/* eslint-disable import/no-dynamic-require */
import os from 'os';
import path from 'path';
import fs from 'fs-extra';
import { argv } from 'yargs';
import { builtinModel } from './common';
import { Entry } from '../loader';

const tmpdir = path.resolve(os.tmpdir(), 'hydro');
const lockfile = path.resolve(tmpdir, 'lock.json');

export async function load(call: Entry) {
    if (fs.existsSync(lockfile) && !argv.ignorelock) {
        const file = require(lockfile);
        console.error(`Lockfile exists, pid=${file.pid}`);
        process.exit(1);
    }
    const context = {
        addons: global.addons,
        pid: process.pid,
        ppid: process.ppid,
    };
    await fs.writeFile(lockfile, JSON.stringify(context));
    global.onDestory.push(() => {
        fs.removeSync(lockfile);
        fs.emptyDirSync(tmpdir);
    });
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
    for (const i of builtinModel) require(`../model/${i}`);
    const modelSystem = require('../model/system');
    const dbVer = await modelSystem.get('db.ver');
    if (dbVer !== 1) {
        const ins = require('../script/upgrade0_1');
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
