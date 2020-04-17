process.stdin.setEncoding('utf8');
process.stdin.on('data', async (input) => {
    try {
        const t = eval(input.toString().trim()); // eslint-disable-line no-eval
        if (t instanceof Promise) console.log(await t);
        else console.log(t);
    } catch (e) {
        console.warn(e);
    }
});
const path = require('path');
const EventEmitter = require('events');
const i18n = require('./lib/i18n');

i18n(path.resolve(__dirname, '..', 'locales', 'zh_CN.yaml'), 'zh_CN');
i18n(path.resolve(__dirname, '..', 'locales', 'zh_TW.yaml'), 'zh_TW');
i18n(path.resolve(__dirname, '..', 'locales', 'en.yaml'), 'en');

global.bus = new EventEmitter();
async function run() {
    require('./utils');
    require('./service/db');
    await new Promise((resolve) => {
        global.bus.once('connected', () => {
            console.log('Database connected');
            resolve();
        });
    });
    require('./service/gridfs');
    const server = require('./service/server');
    require('./handler/home');
    require('./handler/problem');
    require('./handler/record');
    require('./handler/judge');
    require('./handler/user');
    require('./handler/contest');
    require('./handler/training');
    require('./handler/import');
    server.start();
}
process.on('restart', async () => {
    console.log('Signal detected, restarting...');
    await global.Hydro.stop();
    await global.Hydro.destory();
    delete global.Hydro;
    delete require.cache;
    run();
});
run().catch((e) => {
    console.error(e);
    process.exit(1);
});
