/* eslint-disable no-await-in-loop */
/* eslint-disable import/no-dynamic-require */
/* eslint-disable no-sequences */
import { execSync, ExecSyncOptions } from 'child_process';
import crypto from 'crypto';
import { existsSync, readFileSync, writeFileSync } from 'fs';
import net from 'net';
import os, { cpus } from 'os';
import { createInterface } from 'readline/promises';
import supportsHyperlink from 'supports-hyperlinks';

const isSupported = supportsHyperlink.stdout;
const OSC = '\u001B]';
const BEL = '\u0007';
const SEP = ';';
export const link = isSupported ? (text: string, url: string) => [
    OSC, '8', SEP, SEP, url, BEL, text, OSC, '8', SEP, SEP, BEL,
].join('') : (text: string, url: string) => `${text} < ${url} > `;
const freemem = os.freemem();
const smallMemory = (freemem < 1024 * 1024 * 1024);

const nixInstall = (...packages: string[]) => (smallMemory
    ? packages.map((t) => `nix-env -iA ${t.includes('.') ? t : `nixpkgs.${t}`}`).join(' && ')
    : `nix-env -iA ${packages.map((t) => (t.includes('.') ? t : `nixpkgs.${t}`)).join(' ')}`);

const warnings: [string, ...any[]][] = [];

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

const shmFAQ = 'https://docs.hydro.ac/FAQ/#%E8%B0%83%E6%95%B4%E4%B8%B4%E6%97%B6%E7%9B%AE%E5%BD%95%E5%A4%A7%E5%B0%8F';
const locales = {
    zh: {
        'install.wait': '安装脚本将等待 %d 秒后自动继续安装，或按 Ctrl-C 退出。',
        'install.start': '开始运行 Hydro 安装工具',
        'note.avx': `检测到您的 CPU 不支持 avx 指令集，这可能会影响系统运行速度。
如果您正在使用 PVE/VirtualBox 等虚拟机平台，请尝试关机后将虚拟机的 CPU 类型设置为 Host，重启后再次运行该脚本。`,
        'warn.avx': '检测到您的 CPU 不支持 avx 指令集，将使用 mongodb@v4.4',
        'error.rootRequired': '请先使用 sudo su 切换到 root 用户后再运行该工具。',
        'error.unsupportedArch': '不支持的架构 %s ,请尝试手动安装。',
        'error.osreleaseNotFound': '无法获取系统版本信息（/etc/os-release 文件未找到），请尝试手动安装。',
        'error.unsupportedOS': '不支持的操作系统 %s ，请尝试手动安装，',
        'error.centos': 'CentOS 及其变种系统因系统内核过低，无法安装 Hydro，强烈建议使用其他系统。若确有需求，请升级 Linux 内核至 4.4+ 后再手动安装 Hydro。',
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
        'port.80': '端口 80 已被占用，Caddy 无法正常监听此端口。',
        'shm.readFail': '读取 /dev/shm 大小失败。请检查系统是否在此挂载了 tmpfs。',
        'shm.sizeTooSmall': `您的系统 /dev/shm 大小为 %d MB，在高并发评测时可能产生问题。
建议参照文档 ${link('FAQS', shmFAQ)} 进行调整。`,
        'info.skip': '步骤已跳过。',
        'error.bt': `检测到宝塔面板，安装脚本很可能无法正常工作。建议您使用纯净的 Debian 12 系统进行安装。
要忽略该警告，请使用 --shamefully-unsafe-bt-panel 参数重新运行此脚本。`,
        'warn.bt': `检测到宝塔面板，这会对系统安全性与稳定性造成影响。建议使用纯净 Debian 12 系统进行安装。
开发者对因为使用宝塔面板的数据丢失不承担任何责任。
要取消安装，请使用 Ctrl-C 退出。安装程序将在五秒后继续。`,
        'migrate.hustojFound': `检测到 HustOJ。安装程序可以将 HustOJ 中的全部数据导入到 Hydro。（原有数据不会丢失，您可随时切换回 HustOJ）
该功能支持原版 HustOJ 和部分修改版，输入 y 确认该操作。
迁移过程有任何问题，欢迎加QQ群 1085853538 咨询管理员。`,
        'install.restartRequired': '安装完成，请使用 sudo reboot 重启系统。在此之前系统的部分功能可能无法正常使用。',
        'install.warnings': '安装过程中产生了以下警告：',
    },
    en: {
        'install.wait': `The installation script will wait for %d seconds before continuing.
Press Ctrl-C to exit.`,
        'install.start': 'Starting Hydro installation tool',
        'note.avx': `Your CPU does not support avx, this may affect system performance.
If you are using a virtual machine platform such as PVE/VirtualBox,
try shutting down and setting the CPU type of the virtual machine to Host,
then restart and run the script again.`,
        'warn.avx': 'Your CPU does not support avx, will use mongodb@v4.4',
        'error.rootRequired': 'Please run this tool as root user.',
        'error.unsupportedArch': 'Unsupported architecture %s, please try to install manually.',
        'error.osreleaseNotFound': 'Unable to get system version information (/etc/os-release file not found), please try to install manually.',
        'error.unsupportedOS': 'Unsupported operating system %s, please try to install manually.',
        'error.centos': `CentOS and its derivatives are not supported due to low system kernel versions.
It is strongly recommended to use other systems. If you really need it, please upgrade the Linux kernel to 4.4+ and manually install Hydro.`,
        'install.preparing': 'Initializing installation...',
        'install.mongodb': 'Installing mongodb...',
        'install.createDatabaseUser': 'Creating database user...',
        'install.compiler': 'Installing compiler...',
        'install.hydro': 'Installing Hydro...',
        'install.done': 'Hydro installation completed!',
        'install.alldone': 'Hydro installation completed.',
        'install.editJudgeConfigAndStart': 'Please edit config at ~/.hydro/judge.yaml than start hydrojudge with:\npm2 start hydrojudge && pm2 save.',
        'extra.dbUser': 'Database username: hydro',
        'extra.dbPassword': 'Database password: %s',
        'port.80': 'Port 80 is already in use, Caddy cannot listen to this port.',
        'shm.readFail': 'Failed to read /dev/shm size.',
        'shm.sizeTooSmall': `Your system /dev/shm size is %d MB, which may cause problems in high concurrency testing.
Please refer to ${link('FAQS', shmFAQ)} for adjustments.`,
        'info.skip': 'Step skipped.',
        'error.bt': `BT-Panel detected, this script may not work properly. It is recommended to use a clean Debian 12 OS.
To ignore this warning, please run this script again with '--shamefully-unsafe-bt-panel' flag.`,
        'warn.bt': `BT-Panel detected, this will affect system security and stability. It is recommended to use a clean Debian 12 OS.
The developer is not responsible for any data loss caused by using BT-Panel.
To cancel the installation, please use Ctrl-C to exit. The installation program will continue in five seconds.`,
        'migrate.hustojFound': `HustOJ detected. The installation program can migrate all data from HustOJ to Hydro.
The original data will not be lost, and you can switch back to HustOJ at any time.
This feature supports the original version of HustOJ and some modified versions. Enter y to confirm this operation.
If you have any questions about the migration process, please add QQ group 1085853538 to consult the administrator.`,
        'install.restartRequired': 'Please reboot the system. Some functions may not work properly before the restart.',
        'install.warnings': 'The following warnings occurred during the installation:',
    },
};

const installAsJudge = process.argv.includes('--judge');
const noCaddy = process.argv.includes('--no-caddy');
const exposeDb = process.argv.includes('--expose-db');
const addons = ['@hydrooj/ui-default', '@hydrooj/hydrojudge', '@hydrooj/fps-importer', '@hydrooj/a11y'];
const installTarget = installAsJudge ? '@hydrooj/hydrojudge' : `hydrooj ${addons.join(' ')}`;
const substitutersArg = process.argv.find((i) => i.startsWith('--substituters='));
const substituters = substitutersArg ? substitutersArg.split('=')[1].split(',') : [];
const migrationArg = process.argv.find((i) => i.startsWith('--migration='));
let migration = migrationArg ? migrationArg.split('=')[1] : '';

let needRestart = false;

let locale = (process.env.LANG?.includes('zh') || process.env.LOCALE?.includes('zh')) ? 'zh' : 'en';
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
let avx = true;
const cpuInfoFile = readFileSync('/proc/cpuinfo', 'utf-8');
if (!cpuInfoFile.includes('avx') && !installAsJudge) {
    avx = false;
    log.warn('warn.avx');
    warnings.push(['warn.avx']);
}
let retry = 0;
log.info('install.start');
let password = crypto.randomBytes(32).toString('hex');
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
# 仅需将 :80 改为你的域名（如 hydro.ac）后使用 caddy reload 重载配置即可自动签发 ssl 证书。
# 填写完整域名，注意区分有无 www （www.hydro.ac 和 hydro.ac 不同，请检查 DNS 设置）
# 请注意在防火墙/安全组中放行端口，且部分运营商会拦截未经备案的域名。
# 其他需求清参照 https://caddyserver.com/docs/ 说明进行设置。
# For more information, refer to caddy v2 documentation.
:80 {
  encode zstd gzip
  log {
    output file /data/access.log {
      roll_size 1gb
      roll_keep_for 72h
    }
    format json
  }
  # Handle static files directly, for better performance.
  root * /root/.hydro/static
  @static {
    file {
      try_files {path}
    }
  }
  handle @static {
    file_server
  }
  handle {
    reverse_proxy http://127.0.0.1:8888
  }
}

# 如果你需要同时配置其他站点，可参考下方设置：
# 请注意：如果多个站点需要共享同一个端口（如 80/443），请确保为每个站点都填写了域名！
# 动态站点：
# xxx.com {
#    reverse_proxy http://127.0.0.1:1234
# }
# 静态站点：
# xxx.com {
#    root * /www/xxx.com
#    file_server
# }
`;

const judgeYaml = `\
hosts:
  local:
    host: localhost
    type: hydro
    server_url: https://hydro.ac/
    uname: judge
    password: examplepassword
    detail: full
    concurrency: 2
tmpfs_size: 512m
stdio_size: 256m
memoryMax: ${Math.min(1024, os.totalmem() / 4)}m
processLimit: 128
testcases_max: 120
total_time_limit: 600
retry_delay_sec: 3
parallelism: ${Math.max(1, Math.floor(cpus().length / 4))}
singleTaskParallelism: 2
rate: 1.00
rerun: 2
secret: ${crypto.randomBytes(32).toString('hex')}
env: |
    PATH=/usr/local/sbin:/usr/local/bin:/usr/sbin:/usr/bin:/sbin:/bin
    HOME=/w
`;

const nixConfBase = `
trusted-public-keys = cache.nixos.org-1:6NCHdD59X431o0gWypbMrAURkbJ16ZPMQFGspcDShjY= hydro.ac:EytfvyReWHFwhY9MCGimCIn46KQNfmv9y8E2NqlNfxQ=
connect-timeout = 10
experimental-features = nix-command flakes
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
    data.resolutions ||= {};
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

const mem = os.totalmem() / 1024 / 1024 / 1024; // In GiB
// TODO: refuse to install if mem < 1.5
const wtsize = Math.max(0.25, Math.floor((mem / 6) * 100) / 100);

const inviteLink = 'https://qm.qq.com/cgi-bin/qm/qr?k=0aTZfDKURRhPBZVpTYBohYG6P6sxABTw';
const printInfo = [
    () => console.log(`扫码或点击${link('链接', inviteLink)}加入QQ群：`),
    `echo '${inviteLink}' | qrencode -o - -m 2 -t UTF8`,
    () => {
        if (installAsJudge) return;
        const config = require(`${process.env.HOME}/.hydro/config.json`);
        if (config.uri) password = new URL(config.uri).password || '(No password)';
        else password = config.password || '(No password)';
        log.info('extra.dbUser');
        log.info('extra.dbPassword', password);
    },
];

const Steps = () => [
    {
        init: 'install.preparing',
        operations: [
            async () => {
                if (process.env.IGNORE_BT) return;
                const res = exec('bt default');
                if (!res.code) {
                    if (!process.argv.includes('--shamefully-unsafe-bt-panel')) {
                        log.warn('error.bt');
                        process.exit(1);
                    } else {
                        log.warn('warn.bt');
                        warnings.push(['warn.bt']);
                        log.info('install.wait', 5);
                        await sleep(5000);
                    }
                }
            },
            async () => {
                if (process.env.IGNORE_CENTOS) return;
                const res = exec('yum -h');
                if (res.code) return;
                if (!process.argv.includes('--unsupported-centos')) {
                    log.warn('error.centos');
                    process.exit(1);
                } else {
                    log.warn('warn.centos');
                    warnings.push(['warn.centos']);
                }
            },
            async () => {
                if (!avx && !installAsJudge) {
                    log.warn('note.avx');
                    log.info('install.wait', 60);
                    await sleep(60000);
                }
            },
            async () => {
                const shm = exec('df --output=avail -k /dev/shm').output?.split('\n')[1];
                if (!shm || !+shm) {
                    log.warn('shm.readFail');
                    warnings.push(['shm.readFail']);
                    return;
                }
                const size = (+shm) / 1024;
                if (size < 250) {
                    log.warn('shm.sizeTooSmall', size);
                    warnings.push(['shm.sizeTooSmall', size]);
                }
            },
            async () => {
                // Enable memory cgroup for Raspberry Pi
                if (process.arch !== 'arm64') return;
                const isRpi = ['rpi', 'raspberrypi'].some((i) => readFileSync('/proc/cpuinfo', 'utf-8').toLowerCase().includes(i));
                if (!isRpi) return;
                const memoryLine = readFileSync('/proc/cgroups', 'utf-8').split('\n').find((i) => i.includes('memory'))?.trim();
                const memoryCgroupEnabled = memoryLine && !memoryLine.endsWith('0');
                if (memoryCgroupEnabled) return;
                let targetFile = '/boot/cmdline.txt';
                let content = readFileSync(targetFile, 'utf-8');
                if (content.includes('has moved to /boot/firmware/cmdline.txt')) targetFile = '/boot/firmware/cmdline.txt';
                content = readFileSync(targetFile, 'utf-8');
                if (content.includes('cgroup_enable=memory')) return;
                writeFileSync(targetFile, content.replace(' console=', ' cgroup_enable=memory cgroup_memory=1 console='));
                needRestart = true;
            },
            () => {
                if (substituters.length) {
                    writeFileSync('/etc/nix/nix.conf', `substituters = ${substituters.join(' ')}
${nixConfBase}`);
                } else if (!CN) {
                    writeFileSync('/etc/nix/nix.conf', `substituters = https://cache.nixos.org/ https://nix.hydro.ac/cache
${nixConfBase}`);
                }
                if (CN) return;
                // rollback mirrors
                exec('nix-channel --remove nixpkgs', { stdio: 'inherit' });
                exec('nix-channel --add https://nixos.org/channels/nixpkgs-unstable nixpkgs', { stdio: 'inherit' });
                exec('nix-channel --update', { stdio: 'inherit' });
            },
            nixInstall('pm2', 'yarn', 'esbuild', 'bash', 'unzip', 'zip', 'diffutils', 'patch', 'screen', 'gawk'),
            'yarn config set disable-self-update-check true',
            async () => {
                const rl = createInterface(process.stdin, process.stdout);
                try {
                    if (existsSync('/home/judge/src')) {
                        log.info('migrate.hustojFound');
                        const res = await rl.question('>');
                        if (res.toLowerCase().trim() === 'y') migration = 'hustoj';
                    }
                    if (migration) return;
                    const docker = !exec('docker -v').code;
                    if (!docker) return;
                    const containers = exec('docker ps -a --format json').output?.split('\n')
                        .map((i) => i.trim()).filter((i) => i).map((i) => JSON.parse(i)) || [];
                    const uoj = containers.find((i) => i.Image.toLowerCase() === 'universaloj/uoj-system' && i.State === 'running');
                    if (uoj) {
                        log.info('migrate.uojFound');
                        const res = await rl.question('>');
                        if (res.toLowerCase().trim() === 'y') migration = 'uoj';
                    }
                    // // TODO check more places
                    // if (fs.exist('/root/OnlineJudgeDeploy/docker-compose.yml')) {
                    //     const res = cli.prompt('migrate.qduojFound');
                    //     if (res.toLowerCase().trim() === 'y') migration = 'qduoj';
                    // }
                } catch (e) {
                    console.error('Failed migration detection');
                } finally {
                    rl.close();
                }
            },
        ],
    },
    {
        init: 'install.mongodb',
        skip: () => installAsJudge,
        hidden: installAsJudge,
        operations: [
            () => writeFileSync(`${process.env.HOME}/.config/nixpkgs/config.nix`, `\
{
    permittedInsecurePackages = [
        "openssl-1.1.1t"
        "openssl-1.1.1u"
        "openssl-1.1.1v"
        "openssl-1.1.1w"
        "openssl-1.1.1x"
        "openssl-1.1.1y"
        "openssl-1.1.1z"
    ];
}`),
            nixInstall(`hydro.mongodb${avx ? 7 : 4}${CN ? '-cn' : ''}`, 'mongosh', 'mongodb-tools'),
        ],
    },
    {
        init: 'install.compiler',
        operations: [
            nixInstall('gcc', 'python3'),
        ],
    },
    {
        init: 'install.sandbox',
        skip: () => !exec('hydro-sandbox --help').code,
        operations: [
            nixInstall('go-judge'),
            'ln -sf $(which go-judge) /usr/local/bin/hydro-sandbox',
        ],
    },
    {
        init: 'install.caddy',
        skip: () => installAsJudge || noCaddy || existsSync(`${process.env.HOME}/.hydro/Caddyfile`),
        hidden: installAsJudge,
        operations: [
            nixInstall('caddy'),
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
            async () => {
                // eslint-disable-next-line
                const { MongoClient, WriteConcern } = eval('require')('/usr/local/share/.config/yarn/global/node_modules/mongodb') as typeof import('mongodb');
                const client = await MongoClient.connect('mongodb://127.0.0.1', {
                    readPreference: 'nearest',
                    writeConcern: new WriteConcern('majority'),
                });
                await client.db('hydro').command({
                    createUser: 'hydro',
                    pwd: password,
                    roles: [{ role: 'readWrite', db: 'hydro' }],
                });
                await client.close();
            },
            () => writeFileSync(`${process.env.HOME}/.hydro/config.json`, JSON.stringify({
                uri: `mongodb://hydro:${password}@127.0.0.1:27017/hydro`,
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
            // eslint-disable-next-line max-len
            `pm2 start bash --name hydro-sandbox -- -c "ulimit -s unlimited && hydro-sandbox -mount-conf ${process.env.HOME}/.hydro/mount.yaml -http-addr=localhost:5050"`,
            ...installAsJudge ? [] : [
                () => console.log(`WiredTiger cache size: ${wtsize}GB`),
                // The only thing mongod writes to stderr is 'libcurl no version information available'
                `pm2 start mongod --name mongodb -e /dev/null -- --auth ${exposeDb ? '--bind_ip=0.0.0.0 ' : ''}--wiredTigerCacheSizeGB=${wtsize}`,
                () => sleep(1000),
                async () => {
                    if (noCaddy) {
                        exec('hydrooj cli system set server.host 0.0.0.0');
                        return;
                    }
                    if (migration === 'hustoj') {
                        exec('systemctl stop nginx || true');
                        exec('systemctl disable nginx || true');
                        exec('/etc/init.d/nginx stop || true');
                        await sleep(1000);
                    }
                    if (!await isPortFree(80)) {
                        log.warn('port.80');
                        warnings.push(['port.80']);
                    }
                    exec('pm2 start caddy -- run', { cwd: `${process.env.HOME}/.hydro` });
                    exec('hydrooj cli system set server.xff x-forwarded-for');
                    exec('hydrooj cli system set server.xhost x-forwarded-host');
                    exec('hydrooj cli system set server.xproxy true');
                },
                'pm2 start hydrooj',
            ],
            'pm2 startup',
            'pm2 save',
        ],
    },
    {
        init: 'install.migrate',
        skip: () => !migration,
        silent: true,
        operations: [
            ['yarn global add @hydrooj/migrate', { retry: true }],
            'hydrooj addon add @hydrooj/migrate',
        ],
    },
    {
        init: 'install.migrateHustoj',
        skip: () => migration !== 'hustoj',
        silent: true,
        operations: [
            'pm2 restart hydrooj',
            () => {
                const dbInc = readFileSync('/home/judge/src/web/include/db_info.inc.php', 'utf-8');
                const l = dbInc.split('\n');
                function getConfig(key) {
                    const t = l.find((i) => i.includes(`$${key}`))?.split('=', 2)[1].split(';')[0].trim();
                    if (!t) return null;
                    if (t.startsWith('"') && t.endsWith('"')) return t.slice(1, -1);
                    if (t === 'false') return false;
                    if (t === 'true') return true;
                    return +t;
                }
                const config = {
                    host: getConfig('DB_HOST'),
                    port: 3306,
                    name: getConfig('DB_NAME'),
                    dataDir: getConfig('OJ_DATA'),
                    username: getConfig('DB_USER'),
                    password: getConfig('DB_PASS'),
                    contestType: getConfig('OJ_OI_MODE') ? 'oi' : 'acm',
                    domainId: 'system',
                };
                console.log(config);
                exec(`hydrooj cli script migrateHustoj '${JSON.stringify(config)}'`, { stdio: 'inherit' });
                if (!getConfig('OJ_REGISTER')) exec('hydrooj cli user setPriv 0 0');
            },
            'pm2 restart hydrooj',
        ],
    },
    {
        init: 'install.migrateUoj',
        skip: () => migration !== 'uoj',
        silent: true,
        operations: [
            () => {
                const containers = exec('docker ps -a --format json').output?.split('\n')
                    .map((i) => i.trim()).filter((i) => i).map((i) => JSON.parse(i));
                const uoj = containers!.find((i) => i.Image.toLowerCase() === 'universaloj/uoj-system' && i.State === 'running')!;
                const id = uoj.Id || uoj.ID;
                const info = JSON.parse(exec(`docker inspect ${id}`).output!);
                const dir = info[0].GraphDriver.Data.MergedDir;
                exec(`sed s/127.0.0.1/0.0.0.0/g -i ${dir}/etc/mysql/mysql.conf.d/mysqld.cnf`);
                exec(`docker exec -i ${id} /etc/init.d/mysql restart`);
                const passwd = readFileSync(`${dir}/etc/mysql/debian.cnf`, 'utf-8')
                    .split('\n').find((i) => i.startsWith('password'))?.split('=')[1].trim();
                const script = [
                    `CREATE USER 'hydromigrate'@'%' IDENTIFIED BY '${password}';`,
                    'GRANT ALL PRIVILEGES ON *.* TO \'hydromigrate\'@\'%\' WITH GRANT OPTION;',
                    'FLUSH PRIVILEGES;',
                    '',
                ].join('\n');
                exec(`docker exec -i ${id} mysql -u debian-sys-maint -p${passwd} -e "${script}"`);
                const config = {
                    host: info[0].NetworkSettings.IPAddress,
                    port: 3306,
                    name: 'app_uoj233',
                    dataDir: `${dir}/var/uoj_data`,
                    username: 'hydromigrate',
                    password,
                    domainId: 'system',
                };
                console.log(config);
                // TODO mail config
                exec(`hydrooj cli script migrateUniversaloj '${JSON.stringify(config)}'`, { stdio: 'inherit' });
            },
        ],
    },
    {
        init: 'install.done',
        skip: () => installAsJudge,
        operations: printInfo,
    },
    {
        init: 'install.postinstall',
        operations: [
            'echo "layout=2" >/etc/HYDRO_INSTALLER',
            'echo "vm.swappiness = 1" >>/etc/sysctl.conf',
            'sysctl -p',
            // dont retry this as it usually fails
            'screen -d -m "pm2 install pm2-logrotate && pm2 set pm2-logrotate:max_size 64M"',
        ],
    },
    {
        init: 'install.alldone',
        operations: [
            ...printInfo,
            () => log.info('install.alldone'),
            () => installAsJudge && log.info('install.editJudgeConfigAndStart'),
            () => needRestart && log.info('install.restartRequired'),
            () => {
                if (warnings.length) {
                    log.warn('install.warnings');
                    for (const warning of warnings) {
                        log.warn(warning[0], ...warning.slice(1));
                    }
                }
            },
        ],
    },
];

async function main() {
    try {
        if (process.env.REGION) {
            if (process.env.REGION !== 'CN') CN = false;
        } else {
            console.log('Getting IP info to find best mirror:');
            const res = await fetch('https://ipinfo.io', { headers: { accept: 'application/json' } }).then((r) => r.json());
            delete res.readme;
            console.log(res);
            if (res.country !== 'CN') CN = false;
        }
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
                            log.warn('Retry in 3 secs... (%s)', op[0]);

                            await sleep(3000);
                            res = exec(op[0], { stdio: 'inherit' });
                            retry++;
                        } else log.fatal('Error when running %s', op[0]);
                    }
                } else {
                    retry = 0;
                    let res = await op[0](op[1]);
                    while (res === 'retry') {
                        if (retry < 30) {
                            log.warn('Retry in 3 secs...');

                            await sleep(3000);

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
