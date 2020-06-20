/* eslint-disable import/no-dynamic-require */
/* eslint-disable no-await-in-loop */
/* eslint-disable no-eval */
const cluster = require('cluster');
const { argv } = require('yargs');

async function terminate() {
    for (const task of global.onDestory) {
        // eslint-disable-next-line no-await-in-loop
        await task();
    }
    process.exit(0);
}

async function fork(args) {
    if (args) {
        cluster.setupMaster({ args });
        const r = cluster.fork();
        cluster.setupMaster({ args: [] });
        return r;
    }
    return cluster.fork();
}

async function entry(config) {
    if (config.entry) {
        if (config.newProcess) {
            const process = await fork([`--entry=${config.entry}`]);
            await new Promise((resolve) => {
                process.on('exit', resolve);
            });
        } else {
            const loader = require(`./entry/${config.entry}`);
            return await loader(entry);
        }
    }
    return null;
}

async function stopWorker() {
    cluster.disconnect();
}

async function startWorker(cnt) {
    await fork(['--firstWorker']);
    for (let i = 1; i < cnt; i++) await fork();
}

async function executeCommand(input) {
    try {
        const t = eval(input.toString().trim());
        if (t instanceof Promise) console.log(await t);
        else console.log(t);
    } catch (e) {
        console.warn(e);
    }
}

async function messageHandler(worker, msg) {
    if (!msg) msg = worker;
    if (msg.event && msg.event === 'restart') {
        console.log('Restarting');
        await stopWorker();
        console.log('Worker stopped');
        await startWorker(msg.count);
    } else if (msg.event && msg.event === 'run') {
        await executeCommand(msg.command);
    }
}

async function load() {
    global.nodeModules = {
        bson: require('bson'),
        'js-yaml': require('js-yaml'),
        mongodb: require('mongodb'),
    };
    global.Hydro = {
        config: {},
        handler: {},
        service: {},
        model: {},
        script: {},
        lib: {},
        wiki: {},
        template: {},
        ui: {},
    };
    global.onDestory = [];
    Error.stackTraceLimit = 50;
    process.on('unhandledRejection', (e) => console.error(e));
    process.on('SIGINT', terminate);
    process.on('message', messageHandler);
    cluster.on('message', messageHandler);
    if (cluster.isMaster) {
        console.log(`Master ${process.pid} Starting`);
        process.stdin.setEncoding('utf8');
        process.stdin.on('data', (input) => {
            if (input[0] === '@') {
                for (const i in cluster.workers) {
                    cluster.workers[i].send({ event: 'run', command: input.substr(1, input.length - 1) });
                    break;
                }
            } else {
                executeCommand(input);
            }
        });
        const cnt = await entry({ entry: 'master' });
        cluster.on('exit', (worker, code, signal) => {
            console.log(`Worker ${worker.process.pid} ${worker.id} exit: ${code} ${signal}`);
        });
        cluster.on('disconnect', (worker) => {
            console.log(`Worker ${worker.process.pid} ${worker.id} disconnected`);
        });
        cluster.on('listening', (worker, address) => {
            console.log(`Worker ${worker.process.pid} ${worker.id} listening at `, address);
        });
        cluster.on('online', (worker) => {
            console.log(`Worker ${worker.process.pid} ${worker.id} is online`);
        });
        await startWorker(cnt);
    } else if (argv.entry) {
        console.log(`Worker ${process.pid} Starting as ${argv.entry}`);
        await entry({ entry: argv.entry });
        console.log(`Worker ${process.pid} Started as ${argv.entry}`);
    } else {
        if (argv.firstWorker) cluster.isFirstWorker = true;
        console.log(`Worker ${process.pid} Starting`);
        await entry({ entry: 'worker' });
        console.log(`Worker ${process.pid} Started`);
    }
    if (global.gc) global.gc();
}

if (!module.parent) {
    load().catch((e) => {
        console.error(e);
        process.exit(1);
    });
}
