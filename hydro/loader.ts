/* eslint-disable import/no-dynamic-require */
/* eslint-disable no-await-in-loop */
/* eslint-disable no-eval */

import './interface';
import cluster from 'cluster';
import parse from 'yargs-parser';

const argv = parse(process.argv.slice(2));

global.Hydro = {
    stat: { reqCount: 0 },
    handler: {},
    // @ts-ignore
    service: {},
    // @ts-ignore
    model: {},
    script: {},
    // @ts-ignore
    lib: {},
    wiki: {},
    template: {},
    ui: {},
    // @ts-ignore
    error: {},
    locales: {},
    postInit: [],
};
global.onDestory = [];

if (argv.debug) {
    console.log(process.argv);
    process.env.debug = 'enable';
}

async function terminate() {
    for (const task of global.onDestory) {
        // eslint-disable-next-line no-await-in-loop
        await task();
    }
    process.exit(0);
}

async function fork(args: string[] = []) {
    const _args = process.argv.slice(2);
    _args.push(...args);
    cluster.setupMaster({ args: _args });
    return cluster.fork();
}

async function entry(config: any) {
    if (config.entry) {
        if (config.newProcess) {
            const p = await fork([`--entry=${config.entry}`]);
            await new Promise((resolve, reject) => {
                p.on('exit', resolve);
                p.on('error', (err: Error) => {
                    p.kill();
                    reject(err);
                });
            });
        } else {
            const loader = require(`./entry/${config.entry}`);
            return await loader.load(entry);
        }
    }
    return null;
}

async function stopWorker() {
    cluster.disconnect();
}

async function startWorker(cnt: number) {
    await fork(['--firstWorker']);
    for (let i = 1; i < cnt; i++) await fork();
}

async function executeCommand(input: string) {
    try {
        const t = eval(input.toString().trim());
        if (t instanceof Promise) console.log(await t);
        else console.log(t);
    } catch (e) {
        console.warn(e);
    }
}

async function messageHandler(worker: cluster.Worker, msg: any) {
    if (!msg) msg = worker;
    if (msg.event) {
        if (msg.event === 'bus') {
            if (cluster.isMaster) {
                for (const i in cluster.workers) {
                    cluster.workers[i].send(msg);
                }
            } else {
                global.Hydro.service.bus.publish(msg.eventName, msg.payload, false);
            }
        } else if (msg.event === 'stat') {
            global.Hydro.stat.reqCount += msg.count;
        } else if (msg.event === 'restart') {
            console.log('Restarting');
            await stopWorker();
            console.log('Worker stopped');
            await startWorker(msg.count);
        } else if (msg.event === 'run') {
            await executeCommand(msg.command);
        }
    }
}

async function load() {
    global.nodeModules = {
        'adm-zip': require('adm-zip'),
        superagent: require('superagent'),
        'js-yaml': require('js-yaml'),
        mongodb: require('mongodb'),
    };
    Error.stackTraceLimit = 50;
    process.on('unhandledRejection', (e) => console.error(e));
    process.on('SIGINT', terminate);
    process.on('message', messageHandler);
    cluster.on('message', messageHandler);
    if (cluster.isMaster || argv.startAsMaster) {
        console.log(`Master ${process.pid} Starting`);
        process.stdin.setEncoding('utf8');
        process.stdin.on('data', (buf) => {
            const input = buf.toString();
            if (input[0] === '@') {
                for (const i in cluster.workers) {
                    cluster.workers[i].send({ event: 'run', command: input.substr(1, input.length - 1) });
                    break;
                }
            } else {
                executeCommand(input);
            }
        });
        await entry({ entry: 'unzip', newProcess: true });
        const cnt = await entry({ entry: 'master' });
        console.log('Master started');
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
        else cluster.isFirstWorker = false;
        console.log(`Worker ${process.pid} Starting`);
        await entry({ entry: 'worker' });
        console.log(`Worker ${process.pid} Started`);
    }
    if (global.gc) global.gc();
}

if (argv.pandora || !module.parent) {
    load().catch((e) => {
        console.error(e);
        process.exit(1);
    });
}
