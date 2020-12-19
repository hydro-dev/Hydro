/* eslint-disable import/first */
/* eslint-disable no-continue */
/* eslint-disable import/no-dynamic-require */
/* eslint-disable no-await-in-loop */
/* eslint-disable no-eval */
import './interface';
import os from 'os';
import path from 'path';
import cluster from 'cluster';
import fs from 'fs-extra';
import { argv } from 'yargs';
import './utils';

export * from './interface';

if (!global.Hydro) {
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
        // @ts-ignore
        ui: {
            manifest: {},
            nodes: {
                nav: [],
                problem_add: [],
                user_dropdown: [],
            },
            template: {},
        },
        // @ts-ignore
        error: {},
        locales: {},
    };
    global.addons = [];
}

import { Logger } from './logger';
import './ui';
import * as bus from './service/bus';

const logger = new Logger('loader');
logger.debug('%o', argv);

async function fork(args: string[] = []) {
    const _args = process.argv.slice(2);
    _args.push(...args, `--addons=${Buffer.from(JSON.stringify(global.addons)).toString('base64')}`);
    cluster.setupMaster({ args: _args });
    return cluster.fork();
}

interface EntryConfig {
    entry: string,
    newProcess?: boolean,
}

async function entry(config: EntryConfig) {
    if (config.entry) {
        if (config.newProcess) {
            const p = await fork([`--entry=${config.entry}`]);
            await new Promise((resolve, reject) => {
                p.on('exit', (code, signal) => {
                    if (code === 0) resolve();
                    else reject(signal);
                });
                p.on('error', (err: Error) => {
                    p.kill();
                    reject(err);
                });
            });
        } else {
            const loader = require(`./entry/${config.entry}`);
            return await loader.load(entry, global.addons);
        }
    }
    return null;
}

export type Entry = typeof entry;

async function stopWorker() {
    cluster.disconnect();
}

async function startWorker(cnt: number) {
    await fork(['--firstWorker']);
    for (let i = 1; i < cnt; i++) await fork();
}

async function reload(count = 1) {
    logger.info('Reloading');
    await stopWorker();
    logger.info('Worker stopped');
    await startWorker(count);
}

const shell = new Logger('shell');
async function executeCommand(input: string) {
    // Clear the stack
    setImmediate(async () => {
        if (input === 'restart') return reload();
        if (input === 'exit' || input === 'quit' || input === 'shutdown') {
            return process.kill(process.pid, 'SIGINT');
        }
        try {
            // eslint-disable-next-line no-eval
            shell.info(await eval(input.trim()));
        } catch (e) {
            shell.warn(e);
        }
        return true;
    });
}

bus.on('message/reload', reload);
bus.on('message/run', executeCommand);
process.on('unhandledRejection', logger.error);
process.on('uncaughtException', logger.error);

const publicTemp = path.resolve(os.tmpdir(), 'hydro', 'public');

export function addon(addonPath: string) {
    let modulePath = path.resolve(process.cwd(), addonPath);
    if (!(fs.existsSync(addonPath) && fs.statSync(addonPath).isFile())) {
        try {
            // Is a npm package
            const packagejson = require.resolve(`${addonPath}/package.json`);
            modulePath = path.dirname(packagejson);
            const publicPath = path.resolve(modulePath, 'public');
            if (fs.existsSync(publicPath)) fs.copySync(publicPath, publicTemp);
            global.addons.push(modulePath);
        } catch (e) {
            logger.error(`Addon not found: ${addonPath}`);
        }
    } else logger.error(`Addon not found: ${addonPath}`);
}

export async function load() {
    addon(path.resolve(__dirname, '..'));
    Error.stackTraceLimit = 50;
    if (cluster.isMaster || argv.startAsMaster) {
        logger.info(`Master ${process.pid} Starting`);
        const cnt = await entry({ entry: 'master' });
        logger.info('Master started');
        cluster.on('exit', (worker, code, signal) => {
            logger.warn(`Worker ${worker.process.pid} ${worker.id} exit: ${code} ${signal}`);
        });
        cluster.on('disconnect', (worker) => {
            logger.info(`Worker ${worker.process.pid} ${worker.id} disconnected`);
        });
        cluster.on('listening', (worker, address) => {
            logger.success(`Worker ${worker.process.pid} ${worker.id} listening at `, address);
        });
        cluster.on('online', (worker) => {
            logger.success(`Worker ${worker.process.pid} ${worker.id} is online`);
        });
        await startWorker(cnt);
    } else {
        global.addons = JSON.parse(Buffer.from(argv.addons as string, 'base64').toString());
        logger.info('%o', global.addons);
        if (argv.entry) {
            logger.info(`Worker ${process.pid} Starting as ${argv.entry}`);
            await entry({ entry: argv.entry as string });
            logger.success(`Worker ${process.pid} Started as ${argv.entry}`);
        } else {
            if (argv.firstWorker) global.Hydro.isFirstWorker = true;
            else global.Hydro.isFirstWorker = false;
            logger.info(`Worker ${process.pid} Starting`);
            await entry({ entry: 'worker' });
            logger.success(`Worker ${process.pid} Started`);
        }
    }
    if (global.gc) global.gc();
}

export async function loadCli() {
    await entry({ entry: 'cli' });
    process.kill(process.pid, 'SIGINT');
}

if (argv.pandora || require.main === module) {
    const func = argv._[0] === 'cli' ? load : loadCli;
    func().catch((e) => {
        logger.error(e);
        process.exit(1);
    });
}
