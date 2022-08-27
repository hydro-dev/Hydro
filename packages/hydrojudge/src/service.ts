import * as bus from 'hydrooj/src/service/bus';

declare module 'hydrooj/src/interface' {
    interface SystemKeys {
        'hydrojudge.cache_dir': string;
        'hydrojudge.tmp_dir': string;
        'hydrojudge.tmpfs_size': string;
        'hydrojudge.sandbox_host': string;
        'hydrojudge.memoryMax': string;
        'hydrojudge.testcases_max': number;
        'hydrojudge.total_time_limit': number;
        'hydrojudge.parallelism': number;
        'hydrojudge.disable': boolean;
        'hydrojudge.detail': boolean;
    }
}

if (process.env.NODE_APP_INSTANCE === '0') {
    bus.once('app/started', () => require('./hosts/builtin').postInit());
}
