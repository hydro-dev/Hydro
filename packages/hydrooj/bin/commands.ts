import child, { execSync } from 'child_process';
import os from 'os';
import path from 'path';
import cac from 'cac';
import fs from 'fs-extra';

const argv = cac().parse();
let isGlobal = null;
try {
    isGlobal = __dirname.startsWith(execSync('yarn global dir').toString().trim());
} catch (e) {
    // yarn 2 does not support global dir
}

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

if (!addons.includes('@hydrooj/ui-default')) {
    try {
        const ui = argv.options.ui || '@hydrooj/ui-default';
        require.resolve(ui);
        addons.push(ui);
    } catch (e) {
        console.error('Please also install @hydrooj/ui-default');
    }
}

if (!argv.args[0] || argv.args[0] === 'cli') {
    const hydro = require('../src/loader');
    addons = Array.from(new Set(addons));
    for (const addon of addons) hydro.addon(addon);
    (argv.args[0] === 'cli' ? hydro.loadCli : hydro.load)().catch((e) => {
        console.error(e);
        process.exit(1);
    });
} else {
    const cli = cac();
    cli.command('db').action(() => {
        const dbConfig = fs.readFileSync(path.resolve(hydroPath, 'config.json'), 'utf-8');
        const url = buildUrl(JSON.parse(dbConfig));
        child.spawn('mongo', [url], { stdio: 'inherit' });
    });
    cli.command('backup').action(() => {
        const dbConfig = fs.readFileSync(path.resolve(hydroPath, 'config.json'), 'utf-8');
        const url = buildUrl(JSON.parse(dbConfig));
        const dir = `${os.tmpdir()}/${Math.random().toString(36).substring(2)}`;
        exec('mongodump', [url, `--out=${dir}/dump`], { stdio: 'inherit' });
        const env = `${os.homedir()}/.hydro/env`;
        if (fs.existsSync(env)) fs.copySync(env, `${dir}/env`);
        const target = `${process.cwd()}/backup-${new Date().toISOString().replace(':', '-').split(':')[0]}.zip`;
        exec('zip', ['-r', target, 'dump'], { cwd: dir, stdio: 'inherit' });
        if (!argv.options.dbOnly) {
            exec('zip', ['-r', target, 'file'], { cwd: '/data', stdio: 'inherit' });
        }
        exec('rm', ['-rf', dir]);
        console.log(`Database backup saved at ${target}`);
    });
    cli.command('restore <filename>').action((filename) => {
        const dbConfig = fs.readFileSync(path.resolve(hydroPath, 'config.json'), 'utf-8');
        const url = buildUrl(JSON.parse(dbConfig));
        const dir = `${os.tmpdir()}/${Math.random().toString(36).substring(2)}`;
        if (!fs.existsSync(filename)) {
            console.error('Cannot find file');
            return;
        }
        exec('unzip', [filename, '-d', dir], { stdio: 'inherit' });
        exec('mongorestore', [`--uri=${url}`, `--dir=${dir}/dump/hydro`, '--drop'], { stdio: 'inherit' });
        if (fs.existsSync(`${dir}/file`)) {
            exec('rm', ['-rf', '/data/file/*'], { stdio: 'inherit' });
            exec('bash', ['-c', `mv ${dir}/file/* /data/file`], { stdio: 'inherit' });
        }
        if (fs.existsSync(`${dir}/env`)) {
            fs.copySync(`${dir}/env`, `${os.homedir()}/.hydro/env`, { overwrite: true });
        }
        fs.removeSync(dir);
        console.log('Successfully restored.');
    });
    cli.command('addon [operation] [name]').action((operation, name) => {
        if (operation && !['add', 'remove', 'create', 'list'].includes(operation)) {
            console.log('Unknown operation.');
            return;
        }
        if (operation === 'create') {
            name ||= `${os.homedir()}/addon`;
            fs.mkdirSync(name);
            child.execSync('yarn init -y', { cwd: name });
            fs.mkdirSync(`${name}/templates`);
            fs.mkdirSync(`${name}/locales`);
            fs.mkdirSync(`${name}/public`);
            addons.push(name);
            console.log(`Addon created at ${name}`);
        } else if (operation && name) {
            for (let i = 0; i < addons.length; i++) {
                if (addons[i] === name) {
                    addons.splice(i, 1);
                    break;
                }
            }
        }

        if (operation === 'add' && name) addons.push(name);
        addons = Array.from(new Set(addons));
        console.log('Current Addons: ', addons);
        fs.writeFileSync(addonPath, JSON.stringify(addons, null, 2));
    });
    cli.command('install [package]').action((name) => {
        if (!isGlobal) {
            console.warn('This is not a global installation, unable to install.');
            return;
        }
        // TODO support install from tarball
        child.execSync(`yarn global install '${name}'`, { stdio: 'inherit' });
        child.execSync(`hydrooj addon add '${name}'`);
    });
    cli.help();
    cli.parse();
    if (!cli.matchedCommand) console.log('Unknown command.');
}
