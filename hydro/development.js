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

require('./lib/i18n');
require('./utils');

const bus = require('./service/bus');

async function run() {
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
    require('./handler/home');
    require('./handler/problem');
    require('./handler/record');
    require('./handler/judge');
    require('./handler/user');
    require('./handler/contest');
    require('./handler/training');
    require('./handler/discussion');
    require('./handler/manage');
    require('./handler/import');
    server.start();
}
run().catch((e) => {
    console.error(e);
    process.exit(1);
});
