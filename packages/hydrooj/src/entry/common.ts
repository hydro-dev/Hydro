/* eslint-disable no-await-in-loop */
import '../lib/index';

import path from 'path';
import fs from 'fs-extra';
import yaml from 'js-yaml';
import { Context } from '../context';
import { Logger } from '../logger';
import { PRIV } from '../model/builtin';
import { isClass, unwrapExports } from '../utils';

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
        const module = require(q);
        if ('apply' in module || isClass(unwrapExports(module))) ctx.loader.reloadPlugin(q, '');
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
