import { Context } from 'hydrooj';
import { JudgeSettings, overrideConfig } from './config';

export const Config = JudgeSettings;

export function apply(ctx: Context, config: ReturnType<typeof Config>) {
    if (process.env.NODE_APP_INSTANCE !== '0') return;
    overrideConfig(config);
    // eslint-disable-next-line consistent-return
    if (!config.disable) return require('./hosts/builtin').apply(ctx);
}
