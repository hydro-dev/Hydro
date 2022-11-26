/* eslint-disable no-await-in-loop */
/* eslint-disable import/no-dynamic-require */
/* eslint-disable no-sequences */
import { execSync, ExecSyncOptions } from 'child_process';
import { existsSync, readFileSync, writeFileSync } from 'fs';
import net from 'net';
import os from 'os';
import path from 'path';

const exec = (command: string, args?: ExecSyncOptions) => {
    try {
        return {
            output: execSync(command, args).toString(),
            code: 0,
        };
    } catch (e) {
        return {
            code: e.status,
            message: e.message,
        };
    }
};
const sleep = (t: number) => new Promise((r) => { setTimeout(r, t); });
const locales = {
    zh: {
        'install.start': '开始运行 Hydro 安装工具',
        'warn.avx2': '检测到您的 CPU 不支持 avx2 指令集，将使用 mongodb@v4.4',
        'error.rootRequired': '请先使用 sudo su 切换到 root 用户后再运行该工具。',
        'error.unsupportedArch': '不支持的架构 %s ,请尝试手动安装。',
        'error.osreleaseNotFound': '无法获取系统版本信息（/etc/os-release 文件未找到），请尝试手动安装。',
        'error.unsupportedOS': '不支持的操作系统 %s ，请尝试手动安装，',
        'install.preparing': '正在初始化安装...',
        'install.mongodb': '正在安装 mongodb...',
        'install.createDatabaseUser': '正在创建数据库用户...',
        'install.compiler': '正在安装编译器...',
        'install.hydro': '正在安装 Hydro...',
        'install.done': 'Hydro 安装成功！',
        'install.alldone': '安装已全部完成。',
        'install.editJudgeConfigAndStart': '请编辑 ~/.hydro/judge.yaml 后使用 pm2 start hydrojudge && pm2 save 启动。',
        'extra.dbUser': '数据库用户名： hydro',
        'extra.dbPassword': '数据库密码： %s',
        'info.skip': '步骤已跳过。',
        'warn.bt': '检测到宝塔面板，安装脚本很可能无法正常工作。建议您使用纯净的 Ubuntu 22.04 系统进行安装。',
    },
    en: {
        'install.start': 'Starting Hydro installation tool',
        'warn.avx2': 'Your CPU does not support avx2, will use mongodb@v4.4',
        'error.rootRequired': 'Please run this tool as root user.',
        'error.unsupportedArch': 'Unsupported architecture %s, please try to install manually.',
        'error.osreleaseNotFound': 'Unable to get system version information (/etc/os-release file not found), please try to install manually.',
        'error.unsupportedOS': 'Unsupported operating system %s, please try to install manually.',
        'install.preparing': 'Initializing installation...',
        'install.mongodb': 'Installing mongodb...',
        'install.createDatabaseUser': 'Creating database user...',
        'install.compiler': 'Installing compiler...',
        'install.hydro': 'Installing Hydro...',
        'install.done': 'Hydro installation completed!',
        'install.editJudgeConfigAndStart': 'Please edit config at ~/.hydro/judge.yaml than start hydrojudge with:\npm2 start hydrojudge && pm2 save.',
        'extra.dbUser': 'Database username: hydro',
        'extra.dbPassword': 'Database password: %s',
        'info.skip': 'Step skipped.',
        'warn.bt': 'BT-Panel detected, the installation script may not work properly. It is recommended to use a pure Ubuntu 22.04 OS.',
    },
};

const installAsJudge = process.argv.includes('--judge');
const noCaddy = process.argv.includes('--no-caddy');
const installTarget = installAsJudge
    ? '@hydrooj/hydrojudge'
    : 'hydrooj @hydrooj/hydrojudge @hydrooj/ui-default @hydrooj/fps-importer';
const addons = ['@hydrooj/ui-default', '@hydrooj/hydrojudge', '@hydrooj/fps-importer'];

let locale = process.env.LANG?.includes('zh') ? 'zh' : 'en';
if (process.env.TERM === 'linux') locale = 'en';
const processLog = (orig) => (str, ...args) => (orig(locales[locale][str] || str, ...args), 0);
const log = {
    info: processLog(console.log),
    warn: processLog(console.warn),
    fatal: (str, ...args) => (processLog(console.error)(str, ...args), process.exit(1)),
};

if (!process.getuid) log.fatal('error.unsupportedOs');
else if (process.getuid() !== 0) log.fatal('error.rootRequired');
if (!['x64', 'arm64'].includes(process.arch)) log.fatal('error.unsupportedArch', process.arch);
if (!process.env.HOME) log.fatal('$HOME not found');
if (!existsSync('/etc/os-release')) log.fatal('error.osreleaseNotFound');
const osinfoFile = readFileSync('/etc/os-release', 'utf-8');
const lines = osinfoFile.split('\n');
const values = {};
for (const line of lines) {
    if (!line.trim()) continue;
    const d = line.split('=');
    if (d[1].startsWith('"')) values[d[0].toLowerCase()] = d[1].substring(1, d[1].length - 2);
    else values[d[0].toLowerCase()] = d[1];
}
let avx2 = true;
const cpuInfoFile = readFileSync('/proc/cpuinfo', 'utf-8');
if (!cpuInfoFile.includes('avx2') && !installAsJudge) {
    avx2 = false;
    log.warn('warn.avx2');
}
let migration;
let retry = 0;
log.info('install.start');
const defaultDict = 'abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ1234567890';
function randomstring(digit = 32, dict = defaultDict) {
    let str = '';
    for (let i = 1; i <= digit; i++) str += dict[Math.floor(Math.random() * dict.length)];
    return str;
}
let password = randomstring(32);
// eslint-disable-next-line
let CN = true;

const nixProfile = `${process.env.HOME}/.nix-profile/`;
const entry = (source: string, target = source, ro = true) => `\
  - type: bind
    source: ${source}
    target: ${target}${ro ? '\n    readonly: true' : ''}`;
const mount = `mount:
${entry(`${nixProfile}bin`, '/bin')}
${entry(`${nixProfile}bin`, '/usr/bin')}
${entry(`${nixProfile}lib`, '/lib')}
${entry(`${nixProfile}share`, '/share')}
${entry(`${nixProfile}etc`, '/etc')}
${entry('/nix', '/nix')}
${entry('/dev/null', '/dev/null', false)}
${entry('/dev/urandom', '/dev/urandom', false)}
  - type: tmpfs
    target: /w
    data: size=512m,nr_inodes=8k
  - type: tmpfs
    target: /tmp
    data: size=512m,nr_inodes=8k
proc: true
workDir: /w
hostName: executor_server
domainName: executor_server
uid: 1536
gid: 1536
`;
const Caddyfile = `\
# 如果你希望使用其他端口或使用域名，修改此处 :80 的值后在 ~/.hydro 目录下使用 caddy reload 重载配置。
# 如果你在当前配置下能够通过 http://你的域名/ 正常访问到网站，若需开启 ssl，
# 仅需将 :80 改为你的域名（如 hydro.ac）后直接重载配置即可自动签发 ssl 证书。
# 清注意在防火墙/安全组中放行端口，且部分运营商会拦截未经备案的域名。
# For more information, refer to caddy v2 documentation.
:80 {
  reverse_proxy http://127.0.0.1:8888 {
    header_up x-forwarded-for {remote_host}
    header_up x-forwarded-host {hostport}
  }
}
`;

const judgeYaml = `\
hosts:
  local:
    host: localhost
    type: hydro
    server_url: https://hydro.ac/
    uname: judge
    password: examplepassword
    detail: true
tmpfs_size: 512m
stdio_size: 256m
memoryMax: 1024m
processLimit: 128
testcases_max: 60
total_time_limit: 300
retry_delay_sec: 3
parallelism: 10
rate: 1.00
rerun: 0
secret: examplesecret
env: |
    PATH=/usr/local/sbin:/usr/local/bin:/usr/sbin:/usr/bin:/sbin:/bin:/nodejs/bin
    HOME=/w
`;

const isPortFree = async (port: number) => {
    const server = net.createServer();
    const res = await new Promise((resolve) => {
        server.once('error', () => resolve(false));
        server.once('listening', () => resolve(true));
        server.listen(port);
    });
    server.close();
    return res;
};

function removeOptionalEsbuildDeps() {
    const yarnGlobalPath = exec('yarn global dir').output?.trim() || '';
    if (!yarnGlobalPath) return false;
    const pkgjson = `${yarnGlobalPath}/package.json`;
    const data = existsSync(pkgjson) ? require(pkgjson) : {};
    data.resolutions = data.resolutions || {};
    Object.assign(data.resolutions, Object.fromEntries([
        '@esbuild/linux-loong64',
        'esbuild-windows-32',
        ...['android', 'darwin', 'freebsd', 'windows']
            .flatMap((i) => [`${i}-64`, `${i}-arm64`])
            .map((i) => `esbuild-${i}`),
        ...['32', 'arm', 'mips64', 'ppc64', 'riscv64', 's390x']
            .map((i) => `esbuild-linux-${i}`),
        ...['netbsd', 'openbsd', 'sunos']
            .map((i) => `esbuild-${i}-64`),
    ].map((i) => [i, 'link:/dev/null'])));
    exec(`mkdir -p ${yarnGlobalPath}`);
    writeFileSync(pkgjson, JSON.stringify(data, null, 2));
    return true;
}

function rollbackResolveField() {
    const yarnGlobalPath = exec('yarn global dir').output?.trim() || '';
    if (!yarnGlobalPath) return false;
    const pkgjson = `${yarnGlobalPath}/package.json`;
    const data = JSON.parse(readFileSync(pkgjson, 'utf-8'));
    delete data.resolutions;
    writeFileSync(pkgjson, JSON.stringify(data, null, 2));
    return true;
}

const tmpFile = path.join(os.tmpdir(), `${Math.random().toString()}.js`);

const Steps = () => [
    {
        init: 'install.preparing',
        operations: [
            () => {
                if (process.env.IGNORE_BT) return;
                const res = exec('bt default');
                if (!res.code) {
                    log.warn('warn.bt');
                    process.exit(1);
                }
            },
            () => {
                if (CN) return;
                // rollback mirrors
                writeFileSync('/etc/nix/nix.conf', `substituters = https://cache.nixos.org/ https://nix.hydro.ac/cache
trusted-public-keys = cache.nixos.org-1:6NCHdD59X431o0gWypbMrAURkbJ16ZPMQFGspcDShjY= hydro.ac:EytfvyReWHFwhY9MCGimCIn46KQNfmv9y8E2NqlNfxQ=
connect-timeout = 10`);
                exec('nix-channel --del nixpkgs', { stdio: 'inherit' });
                exec('nix-channel --add nixpkgs https://nixos.org/channels/nixpkgs-unstable', { stdio: 'inherit' });
                exec('nix-channel --update', { stdio: 'inherit' });
            },
            'nix-env -iA nixpkgs.pm2 nixpkgs.yarn nixpkgs.esbuild nixpkgs.bash nixpkgs.unzip nixpkgs.zip nixpkgs.diffutils',
            () => {
                // Not implemented yet
                // if (fs.existsSync('/home/judge/src')) {
                //     const res = cli.prompt('migrate.hustojFound');
                //     if (res.toLowerCase().trim() === 'y') migration = 'hustoj';
                // }

                // const docker = !exec1('docker -v').code;
                // if (!docker) return;
                // // TODO check more places
                // if (fs.exist('/root/OnlineJudgeDeploy/docker-compose.yml')) {
                //     const res = cli.prompt('migrate.qduojFound');
                //     if (res.toLowerCase().trim() === 'y') migration = 'qduoj';
                // }
            },
        ],
    },
    {
        init: 'install.mongodb',
        skip: () => installAsJudge,
        hidden: installAsJudge,
        operations: [
            `nix-env -iA hydro.mongodb${avx2 ? 5 : 4}${CN ? '-cn' : ''} hydro.mongosh${avx2 ? 5 : 4}${CN ? '-cn' : ''} nixpkgs.mongodb-tools`,
        ],
    },
    {
        init: 'install.compiler',
        operations: [
            'nix-env -iA nixpkgs.gcc nixpkgs.fpc nixpkgs.python3',
        ],
    },
    {
        init: 'install.sandbox',
        skip: () => !exec('hydro-sandbox --help').code,
        operations: [
            'nix-env -iA hydro.sandbox',
        ],
    },
    {
        init: 'install.caddy',
        skip: () => !exec('caddy version').code || installAsJudge || noCaddy,
        hidden: installAsJudge,
        operations: [
            'nix-env -iA nixpkgs.caddy',
            () => writeFileSync(`${process.env.HOME}/.hydro/Caddyfile`, Caddyfile),
        ],
    },
    {
        init: 'install.hydro',
        operations: [
            () => removeOptionalEsbuildDeps(),
            (CN ? () => {
                let res: any = null;
                try {
                    exec('yarn config set registry https://registry.npmmirror.com/', { stdio: 'inherit' });
                    res = exec(`yarn global add ${installTarget}`, { stdio: 'inherit' });
                } catch (e) {
                    console.log('Failed to install from npmmirror, fallback to yarnpkg');
                } finally {
                    exec('yarn config set registry https://registry.yarnpkg.com', { stdio: 'inherit' });
                }
                try {
                    exec(`yarn global add ${installTarget}`, { timeout: 60000 });
                } catch (e) {
                    console.warn('Failed to check update from yarnpkg');
                    if (res?.code !== 0) return 'retry';
                }
                return null;
            } : [`yarn global add ${installTarget}`, { retry: true }]),
            () => {
                if (installAsJudge) writeFileSync(`${process.env.HOME}/.hydro/judge.yaml`, judgeYaml);
                else writeFileSync(`${process.env.HOME}/.hydro/addon.json`, JSON.stringify(addons));
            },
            () => rollbackResolveField(),
        ],
    },
    {
        init: 'install.createDatabaseUser',
        skip: () => existsSync(`${process.env.HOME}/.hydro/config.json`) || installAsJudge,
        hidden: installAsJudge,
        operations: [
            'pm2 start mongod',
            () => sleep(3000),
            () => writeFileSync(tmpFile, `db.createUser(${JSON.stringify({
                user: 'hydro',
                pwd: password,
                roles: [{ role: 'readWrite', db: 'hydro' }],
            })})`),
            [`mongo 127.0.0.1:27017/hydro ${tmpFile}`, { retry: true }],
            () => writeFileSync(`${process.env.HOME}/.hydro/config.json`, JSON.stringify({
                host: '127.0.0.1',
                port: 27017,
                name: 'hydro',
                username: 'hydro',
                password,
            })),
            'pm2 stop mongod',
            'pm2 del mongod',
        ],
    },
    {
        init: 'install.starting',
        operations: [
            ['pm2 stop all', { ignore: true }],
            () => writeFileSync(`${process.env.HOME}/.hydro/mount.yaml`, mount),
            `pm2 start bash --name hydro-sandbox -- -c "ulimit -s unlimited && hydro-sandbox -mount-conf ${process.env.HOME}/.hydro/mount.yaml"`,
            ...installAsJudge ? [] : [
                'pm2 start mongod --name mongodb -- --auth --bind_ip 0.0.0.0',
                () => sleep(1000),
                'pm2 start hydrooj',
                async () => {
                    if (noCaddy) return;
                    if (!await isPortFree(80)) log.warn('port.80');
                    exec('pm2 start caddy -- run', { cwd: `${process.env.HOME}/.hydro` });
                    exec('hydrooj cli system set server.xff x-forwarded-for');
                    exec('hydrooj cli system set server.xhost x-forwarded-host');
                },
            ],
            'pm2 startup',
            'pm2 save',
        ],
    },
    {
        init: 'install.migrateHustoj',
        skip: () => migration !== 'hustoj',
        silent: true,
        operations: [
            ['yarn global add @hydrooj/migrate', { retry: true }],
            'hydrooj addon add @hydrooj/migrate',
            () => {
                const config = {
                    host: 'localhost',
                    port: 3306,
                    name: 'jol',
                    dataDir: '/home/judge/data',
                    // TODO: auto-read uname&passwd&contestType
                    username: 'debian-sys-maint',
                    password: '',
                    contestType: 'acm',
                };
                exec(`hydrooj cli script migrateHustoj ${JSON.stringify(config)}`);
            },
            'pm2 restart hydrooj',
        ],
    },
    {
        init: 'install.done',
        skip: () => installAsJudge,
        operations: [
            () => {
                password = require(`${process.env.HOME}/.hydro/config.json`).password;
            },
            () => log.info('extra.dbUser'),
            () => log.info('extra.dbPassword', password),
        ],
    },
    {
        init: 'install.postinstall',
        operations: [
            ...installAsJudge ? [] : [
                'hydrooj install https://hydro.ac/language-server-0.0.1.tgz',
                'pm2 restart hydrooj',
            ],
            ['pm2 install pm2-logrotate', { retry: true }],
            'pm2 set pm2-logrotate:max_size 64M',
        ],
    },
    {
        init: 'install.alldone',
        operations: [
            () => log.info('install.alldone'),
            () => installAsJudge && log.info('install.editJudgeConfigAndStart'),
        ],
    },
];

async function main() {
    try {
        console.log('Getting IP info to find best mirror:');
        const res = await fetch('https://ipinfo.io', { headers: { accept: 'application/json' } }).then((r) => r.json());
        delete res.readme;
        console.log(res);
        if (res.country !== 'CN') CN = false;
    } catch (e) {
        console.error(e);
        console.log('Cannot find the best mirror. Fallback to default.');
    }
    const steps = Steps();
    for (let i = 0; i < steps.length; i++) {
        const step = steps[i];
        if (!step.silent) log.info(step.init);
        if (!(step.skip?.())) {
            for (let op of step.operations) {
                if (!(op instanceof Array)) op = [op, {}] as any;
                if (op[0].toString().startsWith('nix-env')) op[1].retry = true;
                if (typeof op[0] === 'string') {
                    retry = 0;
                    let res = exec(op[0], { stdio: 'inherit' });
                    while (res.code && op[1].ignore !== true) {
                        if (op[1].retry && retry < 30) {
                            log.warn('Retry... (%s)', op[0]);
                            res = exec(op[0], { stdio: 'inherit' });
                            retry++;
                        } else log.fatal('Error when running %s', op[0]);
                    }
                } else {
                    retry = 0;
                    let res = await op[0](op[1]);
                    while (res === 'retry') {
                        if (retry < 30) {
                            log.warn('Retry...');
                            // eslint-disable-next-line no-await-in-loop
                            res = await op[0](op[1]);
                            retry++;
                        } else log.fatal('Error installing');
                    }
                }
            }
        } else if (!step.silent) log.info('info.skip');
    }
}
main().catch(log.fatal);
global.main = main;
