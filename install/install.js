/* eslint-disable consistent-return */
/* eslint-disable no-undef */
/// <reference types="./jssh" />

log.info('开始运行 HydroOJ 安装工具 / Starting HydroOJ installation tool');
let MINIO_ACCESS_KEY = randomstring(32);
let MINIO_SECRET_KEY = randomstring(32);
let DATABASE_PASSWORD = randomstring(32);

let retry = 0;

const source_nvm = `\
# load nvm env (by hydro installer)
export NVM_DIR="$HOME/.nvm"
[ -s "$NVM_DIR/nvm.sh" ] && . "$NVM_DIR/nvm.sh"`;
if (__user !== 'root') log.fatal('请使用 root 用户运行该工具。');
if (__arch !== 'amd64') log.fatal('不支持的架构 %s ,请尝试手动安装', __arch);
const dev = !!cli.get('dev');

const _NODE_ = [
    'https://mirrors.tuna.tsinghua.edu.cn/nodejs-release',
    'https://mirrors.cloud.tencent.com/nodejs-release',
    'https://nodejs.org/dist',
];
const _MONGODB_ = [
    'https://mirrors.tuna.tsinghua.edu.cn/mongodb/apt/ubuntu',
    'https://mirrors.cloud.tencent.com/mongodb/apt/ubuntu',
    'https://repo.mongodb.org/apt/ubuntu',
];
const _MINIO_ = [
    'http://dl.minio.org.cn/server/minio/release/linux-amd64/minio',
    'https://s3.undefined.moe/public/minio',
];
const _SANDBOX_ = [
    'https://s3.undefined.moe/file/executor-amd64',
    'https://github.com/criyle/go-judge/releases/download/v1.1.9/executorserver-amd64',
];
if (!fs.exist('/etc/os-release')) log.fatal('/etc/os-release 文件未找到');
const osinfoFile = fs.readfile('/etc/os-release');
const lines = osinfoFile.split('\n');
const values = {};
for (const line of lines) {
    if (!line.trim()) continue;
    const d = line.split('=');
    if (d[1].startsWith('"')) values[d[0].toLowerCase()] = d[1].substr(1, d[1].length - 2);
    else values[d[0].toLowerCase()] = d[1];
}
if (!['ubuntu', 'arch'].includes(values.id)) log.fatal('不支持的系统');
const Arch = values.id === 'arch';

const steps = [
    {
        init: '正在初始化安装 / Preparing',
        operations: [
            'mkdir -p /data/db /data/file ~/.hydro',
            Arch ? 'pacman --needed --quiet --noconfirm -Sy' : 'apt-get -qq update',
            Arch ? 'pacman --needed --quiet --noconfirm -S gnupg curl' : 'apt-get install -y curl wget gnupg',
        ],
    },
    {
        init: '正在安装 MongoDB / Installing MongoDB',
        skip: () => fs.exist('/usr/bin/mongo'),
        operations: Arch
            ? [
                ['curl -fSLO https://s3.undefined.moe/hydro/arch/libcurl-openssl-1.0-7.76.0-1-x86_64.pkg.tar.zst', { retry: true }],
                ['curl -fSLO https://s3.undefined.moe/hydro/arch/mongodb-bin-4.4.5-1-x86_64.pkg.tar.zst', { retry: true }],
                ['curl -fSLO https://s3.undefined.moe/hydro/arch/mongodb-tools-bin-100.3.1-1-x86_64.pkg.tar.zst', { retry: true }],
                'pacman --noconfirm -U libcurl-openssl-1.0-7.76.0-1-x86_64.pkg.tar.zst'
                + 'mongodb-bin-4.4.5-1-x86_64.pkg.tar.zst mongodb-tools-bin-100.3.1-1-x86_64.pkg.tar.zst',
            ]
            : [
                ['wget -qO - https://www.mongodb.org/static/pgp/server-4.4.asc | apt-key add -', { retry: true }],
                [`echo "deb [ arch=amd64 ] ${_MONGODB_[retry % _MONGODB_.length]} ${values.ubuntu_codename}\
/mongodb-org/4.4 multiverse" >/etc/apt/sources.list.d/mongodb-org-4.4.list && \
apt-get -qq update && apt-get -q install -y mongodb-org`, { retry: true }],
            ],
    },
    {
        init: '正在安装 NVM / Installing NVM',
        skip: () => {
            const nvm = fs.exist('/root/.nvm');
            const node = !exec('node -v').code;
            if (node && !nvm) log.fatal('检测到安装了 Node，但未使用 nvm 环境');
            return nvm;
        },
        operations: [
            () => {
                const resp = http.request('GET', 'https://cdn.jsdelivr.net/gh/nvm-sh/nvm@v0.36.0/install.sh');
                const script = resp.body.replace(/raw\.githubusercontent\.com\/nvm-sh\/nvm\//g, 'cdn.jsdelivr.net/gh/nvm-sh/nvm@');
                fs.writefile('/tmp/install-nvm.sh', script);
            },
            'bash /tmp/install-nvm.sh',
        ],
    },
    {
        init: '正在安装 NodeJS / Installing NodeJS',
        operations: [
            () => {
                const res = exec1('bash -c "source /root/.nvm/nvm.sh && nvm install 14"', {
                    NVM_NODEJS_ORG_MIRROR: _NODE_[retry % _NODE_.length],
                });
                let ver;
                try {
                    ver = res.output.split('Now using node v')[1].split(' ')[0];
                } catch (e) {
                    log.error('Cannot parse version. Installation fail.');
                    return 'retry';
                }
                setenv('PATH', `/root/.nvm/versions/node/v${ver}/bin:${__env.PATH}`);
                const rc_path = `/root/.${__env['SHELL'].endsWith('zsh') ? 'zsh' : 'bash'}rc`;
                if (!fs.exist(rc_path)) fs.writefile(rc_path, source_nvm);
                else {
                    const rc_file = fs.readfile(rc_path);
                    if (!rc_file.includes(source_nvm)) fs.appendfile(rc_path, source_nvm);
                }
            },
            ['npm i yarn -g', { retry: true }],
        ],
    },
    {
        init: '正在安装 pm2 / Installing pm2',
        skip: () => fs.exist('/usr/local/bin/pm2'),
        operations: ['yarn global add pm2'],
    },
    {
        init: '正在创建数据库用户 / Creating database user',
        skip: () => fs.exist('/root/.hydro/config.json'),
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
            () => fs.writefile('/root/.hydro/config.json', JSON.stringify({
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
        init: '正在安装 MinIO / Installing MinIO',
        skip: () => fs.exist('/root/.hydro/env'),
        operations: [
            [`curl -fSL ${_MINIO_[retry % _MINIO_.length]} -o /usr/bin/minio`, { retry: true }],
            'chmod +x /usr/bin/minio',
            `echo "MINIO_ACCESS_KEY=${MINIO_ACCESS_KEY}\nMINIO_SECRET_KEY=${MINIO_SECRET_KEY}" >/root/.hydro/env`,
        ],
    },
    {
        init: '正在安装编译器 / Installing compiler',
        operations: [
            Arch ? 'pacman --needed --quiet --noconfirm -S gcc fpc' : 'apt-get install -y g++ fp-compiler >/dev/null',
        ],
    },
    {
        init: '正在安装沙箱 / Installing sandbox',
        operations: [
            [`curl -fSL ${_SANDBOX_[retry % _SANDBOX_.length]} -o /usr/bin/sandbox`, { retry: true }],
            'chmod +x /usr/bin/sandbox',
        ],
    },
    {
        init: '正在安装 HydroOJ / Installing HydroOJ',
        operations: [
            ...(dev
                ? [
                    ['rm -rf /root/Hydro && git clone https://github.com/hydro-dev/Hydro.git /root/Hydro', { retry: true }],
                    ['cd /root/Hydro && yarn', { retry: true }],
                    'cd /root/Hydro && yarn build',
                    'cd /root/Hydro && yarn build:ui',
                    ['yarn global add npx', { retry: true }],
                ]
                : [['yarn global add hydrooj @hydrooj/ui-default @hydrooj/hydrojudge', { retry: true }]]),
            () => fs.writefile('/root/.hydro/addon.json', '["@hydrooj/ui-default","@hydrooj/hydrojudge"]'),
        ],
    },
    {
        init: '正在启动 / Starting',
        operations: [
            () => {
                [MINIO_ACCESS_KEY, MINIO_SECRET_KEY] = fs.readfile('/root/.hydro/env')
                    .split('\n').filter((i) => i.trim()).map((i) => i.split('=')[1].trim());
            },
            `pm2 start "MINIO_ACCESS_KEY=${MINIO_ACCESS_KEY} MINIO_SECRET_KEY=${MINIO_SECRET_KEY} minio server /data/file" --name minio`,
            'pm2 start "mongod --auth --bind_ip 0.0.0.0" --name mongodb',
            () => sleep(1000),
            'pm2 start sandbox',
            'pm2 start hydrooj',
            'pm2 startup',
            'pm2 save',
        ],
    },
    {
        init: '安装完成 / Install done',
        operations: [
            () => {
                [MINIO_ACCESS_KEY, MINIO_SECRET_KEY] = fs.readfile('/root/.hydro/env')
                    .split('\n').filter((i) => i.trim()).map((i) => i.split('=')[1].trim());
                DATABASE_PASSWORD = loadconfig('/root/.hydro/config.json').password;
            },
            () => log.info('请重启终端并切换到 root 用户执行其他操作'),
            () => log.info('Please restart terminal and switch to root user to perform other operations'),
            () => log.info('数据库用户名：hydro / Database username: hydro'),
            () => log.info('数据库密码：%s / Database password: %s', DATABASE_PASSWORD, DATABASE_PASSWORD),
            () => log.info('MINIO_ACCESS_KEY=%s', MINIO_ACCESS_KEY),
            () => log.info('MINIO_SECRET_KEY=%s', MINIO_SECRET_KEY),
        ],
    },
];

for (let i = 0; i < steps.length; i++) {
    const step = steps[i];
    log.info(step.init);
    if (!(step.skip && step.skip())) {
        for (let op of step.operations) {
            if (!(op instanceof Array)) op = [op, {}];
            if (typeof op[0] === 'string') {
                retry = 0;
                exec(op[0], op[1]);
                while (__code !== 0) {
                    if (op[1].retry && retry < 30) {
                        log.warn('Retry...');
                        exec(op[0], op[1]);
                        retry++;
                    } else log.fatal('Error when running %s', op[0]);
                }
            } else op[0](op[1]);
        }
    } else log.info('已跳过该步骤 / Step skipped');
}

exit(0);
