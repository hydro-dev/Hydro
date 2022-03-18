import child from 'child_process';
import os from 'os';
import path from 'path';
import fs from 'fs-extra';
import arg from '@hydrooj/utils/lib/arg';

const argv = arg();

const exec = (...args) => {
    console.log('Executing: ', args[0], args[1].join(' '));
    const res = child.spawnSync(...args);
    if (res.error) throw res.error;
    if (res.status) throw new Error(`Error: Exited with code ${res.status}`);
    return res;
};

function buildUrl(opts) {
    let mongourl = `${opts.protocol || 'mongodb'}://`;
    if (opts.username) mongourl += `${opts.username}:${opts.password}@`;
    mongourl += `${opts.host}:${opts.port}/${opts.name}`;
    if (opts.url) mongourl = opts.url;
    return mongourl;
}

const hydroPath = path.resolve(os.homedir(), '.hydro');
fs.ensureDirSync(hydroPath);
const addonPath = path.resolve(hydroPath, 'addon.json');
if (!fs.existsSync(addonPath)) fs.writeFileSync(addonPath, '[]');
let addons = JSON.parse(fs.readFileSync(addonPath).toString());

if (argv._[0] === 'db') {
    const dbConfig = fs.readFileSync(path.resolve(hydroPath, 'config.json'), 'utf-8');
    const url = buildUrl(JSON.parse(dbConfig));
    child.spawn('mongo', [url], { stdio: 'inherit' });
    process.exit(0);
}

if (argv._[0] === 'backup') {
    const dbConfig = fs.readFileSync(path.resolve(hydroPath, 'config.json'), 'utf-8');
    const url = buildUrl(JSON.parse(dbConfig));
    const dir = `${os.tmpdir()}/${Math.random().toString(36).substring(2)}`;
    exec('mongodump', [url, `--out=${dir}/dump`], { stdio: 'inherit' });
    const env = `${os.homedir()}/.hydro/env`;
    if (fs.existsSync(env)) fs.copySync(env, `${dir}/env`);
    const target = `${process.cwd()}/backup-${new Date().toISOString().replace(':', '-').split(':')[0]}.zip`;
    exec('zip', ['-r', target, 'dump'], { cwd: dir, stdio: 'inherit' });
    if (!argv.dbOnly) {
        exec('zip', ['-r', target, 'file'], { cwd: '/data', stdio: 'inherit' });
    }
    exec('rm', ['-rf', dir]);
    console.log(`Database backup saved at ${target}`);
    process.exit(0);
}

if (argv._[0] === 'restore') {
    const dbConfig = fs.readFileSync(path.resolve(hydroPath, 'config.json'), 'utf-8');
    const url = buildUrl(JSON.parse(dbConfig));
    const dir = `${os.tmpdir()}/${Math.random().toString(36).substring(2)}`;
    if (!fs.existsSync(argv._[1])) {
        console.error('Cannot find file');
        process.exit(1);
    }
    exec('unzip', [argv._[1], '-d', dir], { stdio: 'inherit' });
    exec('mongorestore', [`--uri=${url}`, `--dir=${dir}/dump/${JSON.parse(dbConfig).name}`, '--drop'], { stdio: 'inherit' });
    if (fs.existsSync(`${dir}/file`)) {
        exec('rm', ['-rf', '/data/file/*'], { stdio: 'inherit' });
        exec('bash', ['-c', `mv ${dir}/file/* /data/file`], { stdio: 'inherit' });
    }
    if (fs.existsSync(`${dir}/env`)) {
        fs.copySync(`${dir}/env`, `${os.homedir()}/.hydro/env`, { overwrite: true });
    }
    fs.removeSync(dir);
    console.log('Successfully restored.');
    process.exit(0);
}

if (!addons.includes('@hydrooj/ui-default')) {
    try {
        const ui = argv.ui as string || '@hydrooj/ui-default';
        require.resolve(ui);
        addons.push(ui);
    } catch (e) {
        console.error('Please also install @hydrooj/ui-default');
    }
}

if (argv._[0] && argv._[0] !== 'cli') {
    const operation = argv._[0];
    const arg1 = argv._[1];
    const arg2 = argv._[2];
    if (operation === 'addon') {
        if (arg1 === 'create') {
            fs.mkdirSync('/root/addon');
            child.execSync('yarn init -y', { cwd: '/root/addon' });
            fs.mkdirSync('/root/addon/templates');
            fs.mkdirSync('/root/addon/locales');
            fs.mkdirSync('/root/addon/public');
            addons.push('/root/addon');
        } else if (arg1 === 'add') {
            for (let i = 0; i < addons.length; i++) {
                if (addons[i] === arg2) {
                    addons.splice(i, 1);
                    break;
                }
            }
            addons.push(arg2);
        } else if (arg1 === 'remove') {
            for (let i = 0; i < addons.length; i++) {
                if (addons[i] === arg2) {
                    addons.splice(i, 1);
                    break;
                }
            }
        }
        addons = Array.from(new Set(addons));
        console.log('Current Addons: ', addons);
        fs.writeFileSync(addonPath, JSON.stringify(addons, null, 2));
        process.exit(0);
    }
    console.error('Unknown command: ', argv._[0]);
} else {
    const hydro = require('../src/loader');
    addons = Array.from(new Set(addons));
    for (const addon of addons) hydro.addon(addon);
    (argv._[0] === 'cli' ? hydro.loadCli : hydro.load)().catch((e) => {
        console.error(e);
        process.exit(1);
    });
}
