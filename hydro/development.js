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

global.Hydro = {};

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
    const HandlerHome = require('./handler/home');
    const HandlerProblem = require('./handler/problem');
    const HandlerRecord = require('./handler/record');
    const HandlerJudge = require('./handler/judge');
    const HandlerUser = require('./handler/user');
    const HandlerContest = require('./handler/contest');
    const HandlerTraining = require('./handler/training');
    const HandlerDiscussion = require('./handler/discussion');
    const HandlerManage = require('./handler/manage');
    const HandlerImport = require('./handler/import');
    await loader.model();
    await loader.handler();
    HandlerContest.apply();
    HandlerDiscussion.apply();
    HandlerImport.apply();
    server.start();
}
run().catch((e) => {
    console.error(e);
    process.exit(1);
});
