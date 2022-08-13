/* eslint-disable no-unreachable */
/* eslint-disable consistent-return */
/* eslint-disable no-undef */
/// <reference types="./jssh" />

const locales = {
    zh: {
        'install.start': '开始运行 Hydro 安装工具',
        'info.mirror': '将首选 %s 镜像。可以使用 MIRROR=tsinghua|tencent|official 更改。',
        'warn.avx2': '检测到您的 CPU 不支持 avx2 指令集，将使用 mongodb@v4.4',
        'error.rootRequired': '请先使用 sudo su 切换到 root 用户后再运行该工具。',
        'error.unsupportedArch': '不支持的架构 %s ,请尝试手动安装。',
        'error.osreleaseNotFound': '无法获取系统版本信息（/etc/os-release 文件未找到），请尝试手动安装。',
        'error.unsupportedOS': '不支持的操作系统 %s ，请尝试手动安装，',
        'install.preparing': '正在初始化安装...',
        'install.mongodb': '正在安装 mongodb...',
        'install.nvm': '正在安装 NVM...',
        'error.nodeWithoutNVMDetected': '检测到您的系统中安装了 Node，但未使用 NVM，请尝试手动安装或卸载当前 Node 后再试。',
        'install.nodejs': '正在安装 NodeJS...',
        'error.nodeVersionPraseFail': '无法解析 Node 版本号，请尝试手动安装。',
        'install.pm2': '正在安装 PM2...',
        'install.createDatabaseUser': '正在创建数据库用户...',
        'install.minio': '正在安装 MinIO...',
        'install.compiler': '正在安装编译器...',
        'install.hydro': '正在安装 Hydro...',
        'install.done': 'Hydro 安装成功！',
        'extra.restartTerm': '请重启终端（或重新连接ssh）并切换到 root 用户执行剩下的操作。',
        'extra.dbUser': '数据库用户名： hydro',
        'extra.dbPassword': '数据库密码： %s',
        'info.skip': '步骤已跳过。',
    },
    en: {
        'install.start': 'Starting Hydro installation tool',
        'info.mirror': 'Using preferred %s mirror. You can use MIRROR=tsinghua|tencent|official to change.',
        'warn.avx2': 'Your CPU does not support avx2, will use mongodb@v4.4',
        'error.rootRequired': 'Please run this tool as root user.',
        'error.unsupportedArch': 'Unsupported architecture %s, please try to install manually.',
        'error.osreleaseNotFound': 'Unable to get system version information (/etc/os-release file not found), please try to install manually.',
        'error.unsupportedOS': 'Unsupported operating system %s, please try to install manually.',
        'install.preparing': 'Initializing installation...',
        'install.mongodb': 'Installing mongodb...',
        'install.nvm': 'Installing NVM...',
        'error.nodeWithoutNVMDetected': 'Detected Node installation without NVM, please try to install manually or uninstall current Node first.',
        'install.nodejs': 'Installing NodeJS...',
        'error.nodeVersionPraseFail': 'Unable to parse Node version, please try to install manually.',
        'install.pm2': 'Installing PM2...',
        'install.createDatabaseUser': 'Creating database user...',
        'install.minio': 'Installing MinIO...',
        'install.compiler': 'Installing compiler...',
        'install.hydro': 'Installing Hydro...',
        'install.done': 'Hydro installation completed!',
        'extra.restartTerm': 'Please restart your terminal (or reconnect ssh) and switch to root user to execute the remaining operations.',
        'extra.dbUser': 'Database username: hydro',
        'extra.dbPassword': 'Database password: %s',
        'info.skip': 'Step skipped.',
    },
};
let locale = __env.LANG?.includes('zh') ? 'zh' : 'en';
if (__env.TERM === 'linux') locale = 'en';
log.info = ((orig) => (str, ...args) => orig(locales[locale][str] || str, ...args) && 0)(log.info);
log.warn = ((orig) => (str, ...args) => orig(locales[locale][str] || str, ...args) && 0)(log.warn);
log.fatal = ((orig) => (str, ...args) => orig(locales[locale][str] || str, ...args) && 0)(log.fatal);

if (__user !== 'root') log.fatal('error.rootRequired');
if (__arch !== 'amd64') log.fatal('error.unsupportedArch', __arch);
if (!__env.HOME) log.fatal('$HOME not found');
if (!fs.exist('/etc/os-release')) log.fatal('error.osreleaseNotFound');
const osinfoFile = fs.readfile('/etc/os-release');
const lines = osinfoFile.split('\n');
const values = {};
for (const line of lines) {
    if (!line.trim()) continue;
    const d = line.split('=');
    if (d[1].startsWith('"')) values[d[0].toLowerCase()] = d[1].substr(1, d[1].length - 2);
    else values[d[0].toLowerCase()] = d[1];
}
let avx2 = true;
const cpuInfoFile = fs.readfile('/proc/cpuinfo');
if (!cpuInfoFile.includes('avx2')) {
    avx2 = false;
    log.warn('warn.avx2');
}
let migration;
let retry = 0;
log.info('install.start');
const MINIO_ACCESS_KEY = randomstring(32);
const MINIO_SECRET_KEY = randomstring(32);
let DATABASE_PASSWORD = randomstring(32);
// TODO read from args
const CN = true;

const nixBin = `${__env.HOME}/.nix-profile/bin`;
const mount = `\
mount:
  - type: bind
    source: ${nixBin}
    target: /bin
    readonly: true
  - type: bind
    source: ${nixBin}
    target: /usr/bin
    readonly: true
  - type: bind
    source: /nix
    target: /nix
    readonly: true
  - type: bind
    source: /dev/null
    target: /dev/null
  - type: bind
    source: /dev/urandom
    target: /dev/urandom
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

const steps = [
    {
        init: 'install.preparing',
        operations: [
            'mkdir -p /data/db /data/file ~/.hydro',
            () => {
                if (locale === 'zh') {
                    log.info('扫码加入QQ群：');
                    exec('echo https://qm.qq.com/cgi-bin/qm/qr\\?k\\=0aTZfDKURRhPBZVpTYBohYG6P6sxABTw | qrencode -o - -m 2 -t UTF8', {}, 0);
                }
                log.info(`Hydro includes anonymous system telemetry,
which helps developers figure out the most commonly used operating system and platform.
To disable this feature, checkout our sourcecode.`);
            },
            'bash -c "bash <(curl https://hydro.ac/nix.sh)"',
            () => {
                setenv('PATH', `${__env.HOME}/.nix-profile/bin:${__env.PATH}`);
            },
            'nix-env -iA nixpkgs.coreutils nixpkgs.bash nixpkgs.unzip nixpkgs.zip nixpkgs.diffutils nixpkgs.qrencode',
            () => {
                return; // Not implemented yet
                if (fs.exist('/home/judge/src')) {
                    const res = cli.prompt('migrate.hustojFound');
                    if (res.toLowerCase().trim() === 'y') migration = 'hustoj';
                }

                const docker = !exec1('docker -v').code;
                if (!docker) return;
                // TODO check more places
                if (fs.exist('/root/OnlineJudgeDeploy/docker-compose.yml')) {
                    const res = cli.prompt('migrate.qduojFound');
                    if (res.toLowerCase().trim() === 'y') migration = 'qduoj';
                }
            },
        ],
    },
    {
        init: 'install.mongodb',
        skip: () => !exec('mongod --version').code,
        operations: [
            `nix-env -iA hydro.mongodb${avx2 ? 5 : 4}${CN ? '-cn' : ''}`,
        ],
    },
    {
        init: 'install.mongo',
        skip: () => !exec('mongo --version').code,
        operations: [
            `nix-env -iA hydro.mongosh${avx2 ? 5 : 4}${CN ? '-cn' : ''}`,
        ],
    },
    {
        init: 'install.nodejs',
        skip: () => !exec('node -v').code && !exec('yarn -v').code,
        operations: [
            'nix-env -iA nixpkgs.nodejs nixpkgs.yarn',
        ],
    },
    {
        init: 'install.pm2',
        skip: () => !exec('pm2 -v').code,
        operations: ['yarn global add pm2'],
    },
    {
        init: 'install.minio',
        skip: () => !exec('minio -v').code,
        operations: [
            'nix-env -iA nixpkgs.minio',
        ],
    },
    {
        init: 'install.compiler',
        operations: [
            'nix-env -iA nixpkgs.gcc nixpkgs.fpc',
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
        init: 'install.hydro',
        operations: [
            ['yarn global add hydrooj @hydrooj/ui-default @hydrooj/hydrojudge', { retry: true }],
            () => fs.writefile(`${__env.HOME}/.hydro/addon.json`, '["@hydrooj/ui-default","@hydrooj/hydrojudge"]'),
        ],
    },
    {
        init: 'install.createDatabaseUser',
        skip: () => fs.exist(`${__env.HOME}/.hydro/config.json`),
        operations: [
            'pm2 start mongod',
            () => sleep(5000),
            () => fs.writefile('/tmp/createUser.js', `\
            db.createUser({
              user: 'hydro',
              pwd: '${DATABASE_PASSWORD}',
              roles: [{ role: 'readWrite', db: 'hydro' }]
            })`),
            'mongo 127.0.0.1:27017/hydro /tmp/createUser.js',
            () => fs.writefile(`${__env.HOME}/.hydro/config.json`, JSON.stringify({
                host: '127.0.0.1',
                port: 27017,
                name: 'hydro',
                username: 'hydro',
                password: DATABASE_PASSWORD,
            })),
            'pm2 stop mongod',
            'pm2 del mongod',
        ],
    },
    {
        init: 'install.starting',
        operations: [
            'pm2 stop all',
            () => fs.writefile(`${__env.HOME}/.hydro/mount.yaml`, mount),
            `echo "MINIO_ACCESS_KEY=${MINIO_ACCESS_KEY}\nMINIO_SECRET_KEY=${MINIO_SECRET_KEY}" >/root/.hydro/env`,
            `pm2 start "MINIO_ACCESS_KEY=${MINIO_ACCESS_KEY} MINIO_SECRET_KEY=${MINIO_SECRET_KEY} minio server /data/file" --name minio`,
            'pm2 start mongod --name mongodb -- --auth --bind_ip 0.0.0.0',
            () => sleep(1000),
            `pm2 start bash --name hydro-sandbox -- -c "ulimit -s unlimited && hydro-sandbox -mount-conf ${__env.HOME}/.hydro/mount.yaml"`,
            'pm2 start hydrooj',
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
                exec2(`hydrooj cli script migrateHustoj ${JSON.stringify(config)}`);
            },
            'pm2 restart hydrooj',
        ],
    },
    {
        init: 'install.done',
        operations: [
            () => {
                DATABASE_PASSWORD = loadconfig(`${__env.HOME}/.hydro/config.json`).password;
            },
            () => log.info('extra.restartTerm'),
            () => log.info('extra.dbUser'),
            () => log.info('extra.dbPassword', DATABASE_PASSWORD),
            () => log.info('MINIO_ACCESS_KEY=%s', MINIO_ACCESS_KEY),
            () => log.info('MINIO_SECRET_KEY=%s', MINIO_SECRET_KEY),
        ],
    },
];

for (let i = 0; i < steps.length; i++) {
    const step = steps[i];
    if (!step.silent) log.info(step.init);
    if (!(step.skip && step.skip())) {
        for (let op of step.operations) {
            if (!(op instanceof Array)) op = [op, {}];
            if (op[0].toString().startsWith('nix-env')) op[1].retry = true;
            if (typeof op[0] === 'string') {
                retry = 0;
                exec(op[0], op[1]);
                while (__code !== 0) {
                    if (op[1].retry && retry < 30) {
                        log.warn('Retry... (%s)', op[0]);
                        exec(op[0], op[1]);
                        retry++;
                    } else log.fatal('Error when running %s', op[0]);
                }
            } else {
                retry = 0;
                let res = op[0](op[1]);
                while (res === 'retry') {
                    if (retry < 30) {
                        log.warn('Retry...');
                        res = op[0](op[1]);
                        retry++;
                    } else log.fatal('Error installing');
                }
            }
        }
    } else if (!step.silent) log.info('info.skip');
}

exit(0);
