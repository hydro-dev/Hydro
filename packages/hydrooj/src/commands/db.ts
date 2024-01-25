import child from 'child_process';
import os from 'os';
import path from 'path';
import readline from 'readline/promises';
import cac, { CAC } from 'cac';
import fs from 'fs-extra';
import { Logger, size } from '@hydrooj/utils';
const argv = cac().parse();

const logger = new Logger('db');
const exec = (...args: Parameters<typeof child.spawnSync>) => {
    logger.info('Executing: ', args[0], args[1].join(' '));
    const res = child.spawnSync(...args);
    if (res.error) throw res.error;
    if (res.status) throw new Error(`Error: Exited with code ${res.status}`);
    return res;
};
const hydroPath = path.resolve(os.homedir(), '.hydro');
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
    cli.command('backup').option('--dbOnly', 'Only dump database', { default: false }).action(() => {
        const url = getUrl();
        exec('mongodump', [url, `--out=${dir}/dump`], { stdio: 'inherit' });
        const target = `${process.cwd()}/backup-${new Date().toISOString().replace(':', '-').split(':')[0]}.zip`;
        exec('zip', ['-r', target, 'dump'], { cwd: dir, stdio: 'inherit' });
        if (!argv.options.dbOnly) {
            exec('zip', ['-r', target, 'file'], { cwd: '/data', stdio: 'inherit' });
        }
        exec('rm', ['-rf', dir]);
        const stat = fs.statSync(target);
        logger.success(`Database backup saved at ${target} , size: ${size(stat.size)}`);
    });
    cli.command('restore <filename>').option('-y', 'Assume yes', { default: false }).action(async (filename) => {
        const url = getUrl();
        if (!fs.existsSync(filename)) {
            logger.error('Cannot find file');
            return;
        }
        if (!argv.options.y) {
            const rl = readline.createInterface(process.stdin, process.stdout);
            const answer = await rl.question(`Overwrite current database with backup file ${filename}? [y/N]`);
            rl.close();
            if (answer.toLowerCase() !== 'y') {
                logger.warn('Abort.');
                return;
            }
        }
        exec('unzip', [filename, '-d', dir], { stdio: 'inherit' });
        exec('mongorestore', [`--uri=${url}`, `--dir=${dir}/dump/hydro`, '--drop'], { stdio: 'inherit' });
        if (fs.existsSync(`${dir}/file`)) {
            exec('rm', ['-rf', '/data/file/hydro'], { stdio: 'inherit' });
            exec('bash', ['-c', `mv ${dir}/file/* /data/file`], { stdio: 'inherit' });
        }
        fs.removeSync(dir);
        logger.success('Successfully restored.');
    });
}
