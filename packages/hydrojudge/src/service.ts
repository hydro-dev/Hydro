import { Context } from 'hydrooj';

declare module 'hydrooj' {
    interface SystemKeys {
        'hydrojudge.cache_dir': string;
        'hydrojudge.tmp_dir': string;
        'hydrojudge.sandbox_host': string;
        'hydrojudge.memoryMax': string;
        'hydrojudge.testcases_max': number;
        'hydrojudge.total_time_limit': number;
        'hydrojudge.parallelism': number;
        'hydrojudge.disable': boolean;
        'hydrojudge.detail': boolean;
    }
}

export function apply(ctx: Context) {
    if (process.env.NODE_APP_INSTANCE !== '0') return;
    ctx.once('app/started', () => require('./hosts/builtin').postInit(ctx));
}
