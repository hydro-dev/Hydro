/* eslint-disable import/no-dynamic-require */
/* eslint-disable no-await-in-loop */
import '../lib/index';

import os from 'os';
import path from 'path';
import fs from 'fs-extra';
import yaml from 'js-yaml';
import { Context } from '../context';
import { Logger } from '../logger';
import { PRIV } from '../model/builtin';
import { unwrapExports } from '../utils';

const logger = new Logger('common');

function locateFile(basePath: string, filenames: string[]) {
    for (const i of filenames) {
        const p = path.resolve(basePath, i);
        if (fs.existsSync(p)) return p;
    }
    return null;
}

type LoadTask = 'model' | 'addon' | 'service';
const getLoader = (type: LoadTask, filename: string) => async function loader(pending: Record<string, string>, fail: string[], ctx: Context) {
    for (const [name, i] of Object.entries(pending)) {
        const p = locateFile(i, [`${filename}.ts`, `${filename}.js`]);
        if (p && !fail.includes(i)) {
            const loadType = type.replace(/^(.)/, (t) => t.toUpperCase());
            try {
                const m = unwrapExports(require(p));
                if (m.apply) ctx.loader.reloadPlugin(p, name);
                else logger.info(`${loadType} init: %s`, i);
            } catch (e) {
                fail.push(i);
                app.injectUI(
                    'Notification', `${loadType} load fail: {0}`,
                    { args: [i], type: 'warn' }, PRIV.PRIV_VIEW_SYSTEM_NOTIFICATION,
                );
                logger.info(`${loadType} load fail: %s`, i);
                logger.error(e);
            }
        }
    }
};

export const addon = getLoader('addon', 'index');
export const model = getLoader('model', 'model');
export const service = getLoader('service', 'service');

export async function builtinModel(ctx: Context) {
    const modelDir = path.resolve(__dirname, '..', 'model');
    const models = await fs.readdir(modelDir);
    for (const t of models.filter((i) => i.endsWith('.ts'))) {
        const q = path.resolve(modelDir, t);
        if ('apply' in require(q)) ctx.loader.reloadPlugin(q, '');
    }
}

export async function locale(pending: Record<string, string>, fail: string[]) {
    for (const i of Object.values(pending)) {
        const p = locateFile(i, ['locale', 'locales']);
        if (p && (await fs.stat(p)).isDirectory() && !fail.includes(i)) {
            try {
                const files = await fs.readdir(p);
                for (const file of files) {
                    const content = await fs.readFile(path.resolve(p, file), 'utf-8');
                    const dict = yaml.load(content);
                    if (typeof dict !== 'object' || !dict) throw new Error('Invalid locale file');
                    app.i18n.load(file.split('.')[0], dict as any);
                }
                logger.info('Locale init: %s', i);
            } catch (e) {
                fail.push(i);
                app.injectUI('Notification', 'Locale load fail: {0}', { args: [i], type: 'warn' }, PRIV.PRIV_VIEW_SYSTEM_NOTIFICATION);
                logger.error('Locale Load Fail: %s', i);
                logger.error(e);
            }
        }
    }
}

export async function setting(pending: Record<string, string>, fail: string[], modelSetting: typeof import('../model/setting')) {
    const map = {
        system: modelSetting.SystemSetting,
        account: modelSetting.AccountSetting,
        preference: modelSetting.PreferenceSetting,
        domain: modelSetting.DomainSetting,
    };
    for (const i of Object.values(pending)) {
        let p = path.resolve(i, 'setting.yaml');
        const t = i.split(path.sep);
        // TODO: change this name setting to package name
        const name = t[t.length - 1];
        if (!fs.existsSync(p)) p = path.resolve(i, 'settings.yaml');
        if (fs.existsSync(p) && !fail.includes(i)) {
            try {
                const cfg: any = yaml.load(await fs.readFile(p, 'utf-8'));
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
                app.injectUI('Notification', 'Config load fail: {0}', { args: [i], type: 'warn' }, PRIV.PRIV_VIEW_SYSTEM_NOTIFICATION);
                logger.error('Config Load Fail: %s', i);
                logger.error(e);
            }
        }
    }
}
