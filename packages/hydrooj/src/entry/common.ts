/* eslint-disable no-await-in-loop */
/* eslint-disable no-eval */
import fs from 'fs-extra';
import os from 'os';
import path from 'path';
import yaml from 'js-yaml';
import { Logger } from '../logger';
import * as bus from '../service/bus';

const logger = new Logger('common', true);

export const builtinLib = [
    'jwt', 'download', 'i18n', 'mail', 'useragent',
    'crypto', 'misc', 'paginate', 'hash.hydro', 'rank',
    'validator', 'ui', 'testdataConfig', 'difficulty', 'content',
    'avatar',
];

export const builtinModel = [
    'builtin', 'document', 'domain', 'blacklist', 'opcount',
    'setting', 'token', 'user', 'storage', 'problem',
    'record', 'contest', 'message', 'solution', 'training',
    'discussion', 'system', 'oplog',
];

export const builtinHandler = [
    'home', 'problem', 'record', 'judge', 'user',
    'contest', 'training', 'discussion', 'manage', 'import',
    'misc', 'homework', 'domain', 'remote', 'status',
];

export const builtinScript = [
    'rating', 'problemStat', 'blacklist', 'deleteUser', 'updateFilelist',
];

function getFiles(folder: string, base = ''): string[] {
    const files = [];
    const f = fs.readdirSync(folder);
    for (const i of f) {
        if (fs.statSync(path.join(folder, i)).isDirectory()) {
            files.push(...getFiles(path.join(folder, i), path.join(base, i)));
        } else files.push(path.join(base, i));
    }
    return files.map((item) => item.replace(/\\/gmi, '/'));
}

export async function handler(pending: string[], fail: string[]) {
    for (const i of pending) {
        const p = path.resolve(i, 'handler.js');
        if (fs.existsSync(p) && !fail.includes(i)) {
            try {
                logger.info('Handler init: %s', i);
                eval('require')(p);
            } catch (e) {
                fail.push(i);
                logger.error('Handler Load Fail: %s', i);
                logger.error(e);
            }
        }
    }
    await bus.serial('app/load/handler');
}

export async function locale(pending: string[], fail: string[]) {
    for (const i of pending) {
        let p = path.resolve(i, 'locales');
        if (!fs.existsSync(p)) p = path.resolve(i, 'locale');
        if (fs.existsSync(p) && fs.statSync(p).isDirectory() && !fail.includes(i)) {
            try {
                const files = fs.readdirSync(p);
                const locales = {};
                for (const file of files) {
                    const content = fs.readFileSync(path.resolve(p, file)).toString();
                    locales[file.split('.')[0]] = yaml.load(content);
                }
                global.Hydro.lib.i18n(locales);
                logger.info('Locale init: %s', i);
            } catch (e) {
                fail.push(i);
                logger.error('Locale Load Fail: %s', i);
                logger.error(e);
            }
        }
    }
    await bus.serial('app/load/locale');
}

export async function setting(pending: string[], fail: string[], modelSetting: typeof import('../model/setting')) {
    const map = {
        system: modelSetting.SystemSetting,
        account: modelSetting.AccountSetting,
        preference: modelSetting.PreferenceSetting,
        domain: modelSetting.DomainSetting,
    };
    for (const i of pending) {
        let p = path.resolve(i, 'setting.yaml');
        const t = i.split(path.sep);
        const name = t[t.length - 1];
        if (!fs.existsSync(p)) p = path.resolve(i, 'settings.yaml');
        if (fs.existsSync(p) && !fail.includes(i)) {
            try {
                const cfg: any = yaml.load(fs.readFileSync(p, 'utf-8'));
                for (const key in cfg) {
                    let val = cfg[key].default || cfg[key].value;
                    if (typeof val === 'string') {
                        val = val
                            .replace(/\$TEMP/g, os.tmpdir())
                            .replace(/\$HOME/g, os.homedir());
                    }
                    const category = cfg[key].category || 'system';
                    map[category](
                        modelSetting.Setting(
                            cfg[key].family || name, category === 'system' ? `${name}.${key}` : key, val, cfg[key].type || 'text',
                            cfg[key].name || key, cfg[key].desc || '',
                        ),
                    );
                }
                logger.info('Config load: %s', i);
            } catch (e) {
                logger.error('Config Load Fail: %s', i);
                logger.error(e);
            }
        }
    }
    await bus.serial('app/load/setting');
}

export async function template(pending: string[], fail: string[]) {
    for (const i of pending) {
        let p = path.resolve(i, 'templates');
        if (!fs.existsSync(p)) p = path.resolve(i, 'template');
        if (fs.existsSync(p) && fs.statSync(p).isDirectory() && !fail.includes(i)) {
            try {
                const files = getFiles(p);
                for (const file of files) {
                    global.Hydro.ui.template[file] = await fs.readFile(path.resolve(p, file), 'utf-8');
                }
                logger.info('Template init: %s', i);
            } catch (e) {
                fail.push(i);
                logger.error('Template Load Fail: %s', i);
                logger.error(e);
            }
        }
    }
    await bus.serial('app/load/template');
}

export async function uistatic(pending: string[], fail: string[]) {
    for (const i of pending) {
        const p = path.resolve(i, 'public', 'static-manifest.json');
        if (fs.existsSync(p) && fs.statSync(p).isFile() && !fail.includes(i)) {
            try {
                Object.assign(global.Hydro.ui.manifest, eval('require')(p));
            } catch (e) {
                fail.push(i);
            }
        }
    }
}

export async function model(pending: string[], fail: string[]) {
    for (const i of pending) {
        const p = path.resolve(i, 'model.js');
        if (fs.existsSync(p) && !fail.includes(i)) {
            try {
                logger.info('Model init: %s', i);
                eval('require')(p);
            } catch (e) {
                fail.push(i);
                logger.error('Model Load Fail: %s', i);
                logger.error(e);
            }
        }
    }
    await bus.serial('app/load/model');
}

export async function lib(pending: string[], fail: string[]) {
    for (const i of pending) {
        const p = path.resolve(i, 'lib.js');
        if (fs.existsSync(p) && !fail.includes(i)) {
            try {
                logger.info('Lib init: %s', i);
                eval('require')(p);
            } catch (e) {
                fail.push(i);
                logger.error('Lib Load Fail: %s', i);
                logger.error(e);
            }
        }
    }
    await bus.serial('app/load/lib');
}

export async function service(pending: string[], fail: string[]) {
    for (const i of pending) {
        const p = path.resolve(i, 'service.js');
        if (fs.existsSync(p) && !fail.includes(i)) {
            try {
                logger.info('Service init: %s', i);
                eval('require')(p);
            } catch (e) {
                fail.push(i);
                logger.error('Service Load Fail: %s', i);
                logger.error(e);
            }
        }
    }
    for (const key in global.Hydro.service) {
        const srv = global.Hydro.service[key];
        if (!srv.started && srv.start) await srv.start();
    }
    await bus.serial('app/load/service');
}

export async function script(pending: string[], fail: string[], active: string[]) {
    for (const i of pending) {
        const p = path.resolve(i, 'script.js');
        if (await fs.pathExists(p) && !fail.includes(i)) {
            try {
                logger.info('Script init: %s', i);
                eval('require')(p);
            } catch (e) {
                fail.push(i);
                logger.error('Script Load Fail: %s', i);
                logger.error(e);
            }
        }
        active.push(i);
    }
    await bus.serial('app/load/script');
}
