import child from 'child_process';
import os from 'os';
import path from 'path';
import readline from 'readline/promises';
import cac, { CAC } from 'cac';
import fs from 'fs-extra';
import { Logger, size, sleep } from '@hydrooj/utils';
import { hydroPath } from '../options';
const argv = cac().parse();

const logger = new Logger('db');
const exec = (...args: Parameters<typeof child.spawnSync>) => {
    logger.info('Executing: ', args[0], args[1].join(' '));
    const res = child.spawnSync(...args);
    if (res.error) throw res.error;
    if (res.status) throw new Error(`Error: Exited with code ${res.status}`);
    return res;
};
const dir = `${os.tmpdir()}/${Math.random().toString(36).substring(2)}`;
function getUrl() {
    const dbConfig = fs.readFileSync(path.resolve(hydroPath, 'config.json'), 'utf-8');
    const opts = JSON.parse(dbConfig);
    if (opts.url || opts.uri) return opts.url || opts.uri;
    let mongourl = `${opts.protocol || 'mongodb'}://`;
    if (opts.username) mongourl += `${opts.username}:${opts.password}@`;
    mongourl += `${opts.host}:${opts.port}/${opts.name}`;
    return mongourl;
}

export function register(cli: CAC) {
    cli.command('db').action(() => {
        const url = getUrl();
        try {
            logger.info('Detecting mongosh...');
            const mongosh = child.execSync('mongosh --version').toString();
            if (/\d+\.\d+\.\d+/.test(mongosh)) child.spawn('mongosh', [url], { stdio: 'inherit' });
        } catch (e) {
            logger.warn('Cannot run mongosh. Trying legacy mongo client...');
            child.spawn('mongo', [url], { stdio: 'inherit' });
        }
    });

    const withPasswordFile = async (password: string, cb: (passwordFile: string) => Promise<void>) => {
        if (!password) throw new Error('Restic password is required');
        const passwordFile = path.join(os.tmpdir(), 'hydrooj-restic-password');
        fs.writeFileSync(passwordFile, password.toString());
        await cb(passwordFile);
        fs.removeSync(passwordFile);
    };

    cli.command('backup')
        .option('--dbOnly', 'Only dump database', { default: false })
        .option('--withAddons', 'Include addons', { default: false })
        .option('--withLogs', 'Include logs', { default: false })
        .option('-r <repo>', 'Restic repository', { default: '' })
        .option('-p <password>', 'Restic password', { default: '' })
        .action(async () => {
            const url = getUrl();
            exec('mongodump', [
                url, `--out=${dir}/dump`,
                '--excludeCollection=opcount', '--excludeCollection=event',
                ...(argv.options.withLogs ? [] : ['--excludeCollection=oplog']),
            ], { stdio: 'inherit' });
            const target = `${process.cwd()}/backup-${new Date().toISOString().replace(':', '-').split(':')[0]}.zip`;
            const filesToAdd = [];
            const filesToRemove = [];
            const addFile = argv.options.r
                ? (cwd: string, item: string, keepSource = true) => {
                    filesToAdd.push(item);
                    if (cwd === '/data') return;
                    if (keepSource) fs.copySync(path.join(cwd, item), path.join('/data', item), { overwrite: true });
                    else fs.moveSync(path.join(cwd, item), path.join('/data', item), { overwrite: true });
                    filesToRemove.push(path.join(cwd, item));
                }
                : (cwd: string, item: string, keepSource = true) => {
                    exec('zip', ['-gr', target, item], { cwd, stdio: 'inherit' });
                    if (!keepSource) fs.removeSync(path.join(cwd, item));
                };
            addFile(dir, 'dump', false);
            if (!argv.options.dbOnly) addFile('/data', 'file');
            if (argv.options.withAddons) {
                if (fs.existsSync(path.join(hydroPath, 'addons'))) addFile(hydroPath, 'addons');
                if (fs.existsSync(path.join(hydroPath, 'addon.json'))) addFile(hydroPath, 'addon.json');
            }
            if (argv.options.withLogs && fs.existsSync('/data/access.log')) addFile('/data', 'access.log');
            if (argv.options.r) {
                await withPasswordFile(argv.options.p, async (file) => {
                    exec('restic', ['backup', '-r', argv.options.r.toString(), '-p', file, ...filesToAdd], { stdio: 'inherit', cwd: '/data' });
                });
                for (const file of filesToRemove) fs.removeSync(file);
            } else {
                const stat = fs.statSync(target);
                logger.success(`Database backup saved at ${target} , size: ${size(stat.size)}`);
            }
            fs.removeSync(dir);
        });
    cli.command('restore [filename]')
        .option('-y', 'Assume yes', { default: false })
        .option('--withAddons', 'Include addons', { default: false })
        .option('-r <repo>', 'Restic repository', { default: '' })
        .option('-p <password>', 'Restic password', { default: '' })
        .action(async (filename) => {
            const url = getUrl();
            let restic: child.ChildProcess;
            let dataDir = dir;
            if (filename && !fs.existsSync(filename)) {
                logger.error('Cannot find file');
                return;
            }
            if (!filename && !argv.options.r) {
                logger.error('No backup file or restic repository specified');
                return;
            }
            if (!argv.options.y) {
                const rl = readline.createInterface(process.stdin, process.stdout);
                const source = argv.options.r ? `restic repository ${argv.options.r}` : `backup file ${filename}`;
                const answer = await rl.question(`Overwrite current database with ${source}? [y/N]`);
                rl.close();
                if (answer.toLowerCase() !== 'y') {
                    logger.warn('Abort.');
                    return;
                }
            }
            if (filename && filename.endsWith('.zip')) {
                exec('unzip', [filename, '-d', dir], { stdio: 'inherit' });
            } else if (filename) {
                dataDir = filename;
            } else {
                fs.ensureDirSync(dir);
                await withPasswordFile(argv.options.p, async (passwordFile) => {
                    restic = child.spawn('restic', ['mount', '-r', argv.options.r, '-p', passwordFile, dir], { stdio: 'inherit' });
                    await sleep(1000);
                });
                dataDir = path.join(dir, 'snapshots/latest');
            }
            let isReadOnly = false;
            try {
                await fs.access(dataDir, fs.constants.W_OK);
            } catch (e) {
                isReadOnly = true;
            }
            exec('mongorestore', [`--uri=${url}`, `--dir=${dataDir}/dump/hydro`, '--drop'], { stdio: 'inherit' });
            if (fs.existsSync(`${dataDir}/file`)) {
                if (argv.options.r) {
                    await withPasswordFile(argv.options.p, async (file) => {
                        exec('restic', [
                            'restore', '-r', argv.options.r, '-p', file, 'latest',
                            '-t', '/data', '-i', '/file', '--delete',
                            '--overwrite', 'if-changed', '--path', '/data/file',
                        ], { stdio: 'inherit' });
                    });
                } else {
                    await fs.remove('/data/file/hydro');
                    exec('bash', ['-c', `${isReadOnly ? 'cp -r' : 'mv'} ${dataDir}/file/* /data/file`], { stdio: 'inherit' });
                }
            }
            if (argv.options.withAddons) {
                if (fs.existsSync(`${dataDir}/addons.json`)) {
                    fs.copyFileSync(`${dataDir}/addons.json`, path.join(hydroPath, 'addons.json'));
                }
                if (fs.existsSync(`${dataDir}/addons`)) {
                    fs.removeSync(path.join(hydroPath, 'addons'));
                    fs.copySync(`${dataDir}/addons`, path.join(hydroPath, 'addons'));
                }
            }
            if (restic) {
                await new Promise((resolve) => {
                    restic.on('exit', () => resolve(null));
                    restic.kill('SIGINT');
                });
            }
            fs.removeSync(dir);
            logger.success('Successfully restored.');
        });
}
