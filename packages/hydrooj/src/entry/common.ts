/* eslint-disable no-await-in-loop */
/* eslint-disable no-eval */
import fs from 'fs';
import path from 'path';
import yaml from 'js-yaml';
import { Logger } from '../logger';

const logger = new Logger('common', true);

export const builtinLib = [
    'jwt', 'download', 'i18n', 'mail', 'useragent',
    'md5', 'misc', 'paginate', 'hash.hydro', 'rank',
    'validator', 'ui', 'sysinfo', 'testdata.convert.ini', 'testdataConfig',
    'logger',
];

export const builtinModel = [
    'builtin', 'document', 'domain', 'blacklist', 'opcount',
    'setting', 'token', 'user', 'problem', 'record',
    'contest', 'message', 'solution', 'training', 'file',
    'discussion', 'system',
];

export const builtinHandler = [
    'home', 'problem', 'record', 'judge', 'user',
    'contest', 'training', 'discussion', 'manage', 'import.syzoj',
    'misc', 'homework', 'domain',
];

export const builtinScript = [
    'rating', 'difficulty', 'problemStat', 'blacklist', 'deleteUser',
    'upgrade0_1',
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
                logger.error('%o', e);
            }
        }
    }
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
                    locales[file.split('.')[0]] = yaml.safeLoad(content);
                }
                global.Hydro.lib.i18n(locales);
                logger.info('Locale init: %s', i);
            } catch (e) {
                fail.push(i);
                logger.error('Locale Load Fail: %s', i);
                logger.error('%o', e);
            }
        }
    }
}

export async function setting(pending: string[], fail: string[], modelSetting: typeof import('../model/setting')) {
    const map = {
        system: modelSetting.SystemSetting,
        account: modelSetting.AccountSetting,
        preference: modelSetting.PreferenceSetting,
    };
    for (const i of pending) {
        let p = path.resolve(i, 'setting.yaml');
        const t = i.split(path.sep);
        const name = t[t.length - 1];
        if (!fs.existsSync(p)) p = path.resolve(i, 'settings.yaml');
        if (fs.existsSync(p) && !fail.includes(i)) {
            try {
                const cfg: any = yaml.safeLoad(fs.readFileSync(p).toString());
                for (const key in cfg) {
                    map[cfg[key].category || 'system'](
                        modelSetting.Setting(
                            name, `${name}.${key}`, cfg[key].range, cfg[key].default,
                            cfg[key].type || 'text', cfg[key].name || key, cfg[key].desc || '',
                        ),
                    );
                }
            } catch (e) {
                logger.error('Config Load Fail: %s', i);
                logger.error(e);
            }
        }
    }
}

export async function template(pending: string[], fail: string[]) {
    for (const i of pending) {
        let p = path.resolve(i, 'templates');
        if (!fs.existsSync(p)) p = path.resolve(i, 'template');
        if (fs.existsSync(p) && fs.statSync(p).isDirectory() && !fail.includes(i)) {
            try {
                const files = getFiles(p);
                for (const file of files) {
                    global.Hydro.ui.template[file] = fs.readFileSync(
                        path.resolve(p, file),
                    ).toString();
                }
                logger.info('Template init: %s', i);
            } catch (e) {
                fail.push(i);
                logger.error('Template Load Fail: %s', i);
                logger.error(e);
            }
        }
    }
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
}

export async function script(pending: string[], fail: string[], active: string[]) {
    for (const i of pending) {
        const p = path.resolve(i, 'script.js');
        if (fs.existsSync(p) && !fail.includes(i)) {
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
}
