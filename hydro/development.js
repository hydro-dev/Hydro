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

global.Hydro = {
    handler: {},
    template: {}
};

require('./lib/i18n');
require('./utils');

const bus = require('./service/bus');
const loader = require('./lib/loader');

async function run() {
    await loader.prepare();
    await new Promise((resolve) => {
        const h = () => {
            console.log('Database connected');
            bus.unsubscribe(['system_database_connected'], h);
            resolve();
        };
        bus.subscribe(['system_database_connected'], h);
        require('./service/db');
    });
    require('./service/gridfs');
    require('./service/queue');
    const server = require('./service/server');
    const builtinHandler = [
        'home', 'problem', 'record', 'judge', 'user',
        'contest', 'training', 'discussion', 'manage', 'import',
    ];
    for (const i of builtinHandler) require(`./handler/${i}`);
    await loader.model();
    await loader.handler();
    for (const i in global.Hydro.handler) {
        await global.Hydro.handler[i].apply();
    }
    const notfound = require(`./handler/notfound`);
    await notfound.apply();
    server.start();
}
run().catch((e) => {
    console.error(e);
    process.exit(1);
});
