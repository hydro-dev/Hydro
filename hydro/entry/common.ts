/* eslint-disable no-await-in-loop */
/* eslint-disable no-eval */
import os from 'os';
import fs from 'fs';
import path from 'path';
import yaml from 'js-yaml';

export const builtinLib = [
    'jwt', 'download', 'i18n', 'mail', 'markdown',
    'md5', 'misc', 'paginate', 'hash.hydro', 'rank',
    'template', 'validator', 'nav', 'sysinfo', 'testdata.convert.ini',
    'readConfig', 'logger', 'useragent',
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
    'misc', 'homework', 'domain', 'wiki',
];

export const builtinScript = [
    'install', 'rating', 'recalcRating', 'register', 'problemStat',
    'blacklist', 'setSuperadmin', 'deleteUser',
];

function getFiles(folder, base = '') {
    const files = [];
    const f = fs.readdirSync(folder);
    for (const i of f) {
        if (!i.startsWith('.')) {
            if (fs.statSync(path.join(folder, i)).isDirectory()) {
                files.push(...getFiles(path.join(folder, i), path.join(base, i)));
            } else files.push(path.join(base, i));
        }
    }
    return files;
}

export async function handler(pending, fail) {
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
            }
        }
    }
}

export async function locale(pending, fail) {
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
            }
        }
    }
}

export async function setting(pending, fail, modelSetting: typeof import('../model/setting')) {
    const map = {
        system: modelSetting.SystemSetting,
        account: modelSetting.AccountSetting,
        preference: modelSetting.PreferenceSetting,
    };
    for (const i of pending) {
        let p = path.resolve(i, 'setting.yaml');
        if (!fs.existsSync(p)) p = path.resolve(i, 'settings.yaml');
        if (fs.existsSync(p) && !fail.includes(i)) {
            try {
                const cfg: any = yaml.safeLoad(fs.readFileSync(p).toString());
                for (const key in cfg) {
                    map[cfg[key].category || 'system'](
                        modelSetting.Setting(
                            i, `${i}.${key}`, cfg[key].range, cfg[key].default,
                            cfg[key].type || 'text', cfg[key].name || key, cfg[key].desc || '',
                        ),
                    );
                }
            } catch (e) {
                console.error(`Config Load Fail: ${i}`);
            }
        }
    }
}

export async function template(pending, fail) {
    for (const i of pending) {
        let p = path.resolve(i, 'templates');
        if (!fs.existsSync(p)) p = path.resolve(i, 'template');
        if (fs.existsSync(p) && fs.statSync(p).isDirectory() && !fail.includes(i)) {
            try {
                const files = getFiles(p);
                for (const file of files) {
                    global.Hydro.template[file] = fs.readFileSync(path.resolve(p, file)).toString();
                }
                console.log(`Template init: ${i}`);
            } catch (e) {
                fail.push(i);
                console.error(`Template Load Fail: ${i}`);
            }
        }
    }
}

export async function model(pending, fail) {
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
            }
        }
    }
}

export async function lib(pending, fail) {
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
                console.error(e);
            }
        }
    }
}

export async function service(pending, fail) {
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
                console.error(e);
            }
        }
    }
}

export async function script(pending, fail, active) {
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
                console.error(e);
            }
        }
        active.push(i);
    }
}

export async function wiki(pending, fail) {
    for (const i of pending) {
        const p = path.resolve(i, 'wiki');
        if (fs.existsSync(p) && fs.statSync(p).isDirectory() && !fail.includes(i)) {
            try {
                const r = {};
                const categories = fs.readdirSync(p);
                for (const category of categories) {
                    if (!fs.statSync(p).isDirectory()) return;
                    const pages = fs.readdirSync(path.join(p, category));
                    const res = {};
                    for (const page of pages) {
                        const c = fs.readFileSync(path.join(p, category, page)).toString().split('\n');
                        const pagename = page.split('.')[0];
                        res[pagename] = [];
                        let content = null;
                        for (let j = 0; j < c.length; j++) {
                            const line = c[j];
                            if (line.startsWith('# ')) {
                                if (content) res[pagename].push(content);
                                content = {};
                                const t = line.split('# ')[1].split('|');
                                [content.title, content.id] = t.map((q) => q.trim());
                                content.content = '';
                            } else {
                                content.content = `${content.content}${line}\n`;
                            }
                        }
                    }
                    r[category] = res;
                }
                console.log(`Wiki init: ${i}`);
            } catch (e) {
                fail.push(i);
                console.error(`Wiki Load Fail: ${i}`);
            }
        }
    }
}
