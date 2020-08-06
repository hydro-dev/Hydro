/* eslint-disable no-await-in-loop */
/* eslint-disable no-eval */
import fs from 'fs';
import path from 'path';
import yaml from 'js-yaml';
import { argv } from 'yargs';

export const builtinLib = [
    'jwt', 'download', 'i18n', 'mail', 'useragent',
    'md5', 'misc', 'paginate', 'hash.hydro', 'rank',
    'validator', 'nav', 'sysinfo', 'testdata.convert.ini', 'testdataConfig',
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
    'contest', 'training', 'discussion', 'manage', 'import',
    'misc', 'homework', 'domain',
];

export const builtinScript = [
    'rating', 'register', 'problemStat', 'blacklist', 'deleteUser',
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
                console.log(`Handler init: ${i}`);
                console.time(`Handler init: ${i}`);
                eval('require')(p);
                console.timeEnd(`Handler init: ${i}`);
            } catch (e) {
                fail.push(i);
                console.error(`Handler Load Fail: ${i}`);
                if (argv.debug) console.error(e);
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
                console.log(`Locale init: ${i}`);
            } catch (e) {
                fail.push(i);
                console.error(`Locale Load Fail: ${i}`);
                if (argv.debug) console.error(e);
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
                console.error(`Config Load Fail: ${i}`);
                if (argv.debug) console.error(e);
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
                console.log(`Template init: ${i}`);
            } catch (e) {
                fail.push(i);
                console.error(`Template Load Fail: ${i}`);
                if (argv.debug) console.error(e);
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
                console.log(`Model init: ${i}`);
                console.time(`Model init: ${i}`);
                eval('require')(p);
                console.timeEnd(`Model init: ${i}`);
            } catch (e) {
                fail.push(i);
                console.error(`Model Load Fail: ${i}`);
                if (argv.debug) console.error(e);
            }
        }
    }
}

export async function lib(pending: string[], fail: string[]) {
    for (const i of pending) {
        const p = path.resolve(i, 'lib.js');
        if (fs.existsSync(p) && !fail.includes(i)) {
            try {
                console.log(`Lib init: ${i}`);
                console.time(`Lib init: ${i}`);
                eval('require')(p);
                console.timeEnd(`Lib init: ${i}`);
            } catch (e) {
                fail.push(i);
                console.error(`Lib Load Fail: ${i}`);
                if (argv.debug) console.error(e);
            }
        }
    }
}

export async function service(pending: string[], fail: string[]) {
    for (const i of pending) {
        const p = path.resolve(i, 'service.js');
        if (fs.existsSync(p) && !fail.includes(i)) {
            try {
                console.log(`Service init: ${i}`);
                console.time(`Service init: ${i}`);
                eval('require')(p);
                console.timeEnd(`Service init: ${i}`);
            } catch (e) {
                fail.push(i);
                console.error(`Service Load Fail: ${i}`);
                if (argv.debug) console.error(e);
            }
        }
    }
}

export async function script(pending: string[], fail: string[], active: string[]) {
    for (const i of pending) {
        const p = path.resolve(i, 'script.js');
        if (fs.existsSync(p) && !fail.includes(i)) {
            try {
                console.time(`Script init: ${i}`);
                eval('require')(p);
                console.timeEnd(`Script init: ${i}`);
            } catch (e) {
                fail.push(i);
                console.error(`Script Load Fail: ${i}`);
                if (argv.debug) console.error(e);
            }
        }
        active.push(i);
    }
}
