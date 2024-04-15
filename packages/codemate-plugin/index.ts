/* eslint-disable import/no-dynamic-require */
import path from 'path';
import fs from 'fs-extra';
import { type Context, unwrapExports } from 'hydrooj';
import { logger } from './api';

const PLUGINS_ROOT = path.resolve(__dirname, './plugins');

// 该插件的唯一作用就是加载其下的所有子插件
export async function apply(ctx: Context) {
    const plugins = fs.readdirSync(PLUGINS_ROOT);
    for (const plugin of plugins) {
        const pluginPath = path.resolve(PLUGINS_ROOT, plugin);
        let _m;
        try {
            if (fs.statSync(pluginPath).isDirectory()) {
                const entry = ['index.ts', 'index.js']
                    .map((i) => path.resolve(pluginPath, i))
                    .find((i) => fs.existsSync(i));
                if (!entry) {
                    logger.error(`Plugin ${plugin} not found`);
                    continue;
                }
                _m = unwrapExports(require(entry));
            } else {
                _m = unwrapExports(require(pluginPath));
            }
            if (!_m.apply) {
                logger.error(`Plugin ${plugin} has no apply function`);
                continue;
            }
            _m.apply(ctx);
            logger.info(`Sub-plugin loaded: ${plugin}`);
        } catch (e) {
            console.error(e);
        }
    }
}
