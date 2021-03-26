import './jssh';

const NVM_NODEJS_ORG_MIRROR = 'https://mirrors.tuna.tsinghua.edu.cn/nodejs-release';
const MONGODB_REPO = 'https://mirrors.tuna.tsinghua.edu.cn/mongodb/apt/ubuntu';
const MINIO_DOWNLOAD = 'http://dl.minio.org.cn/server/minio/release/linux-amd64/minio';

const map = {
    16.04: 'xenial',
    18.04: 'bionic',
    20.04: 'focal',
};
const ver = cli.prompt('系统版本：16.04/18.04/20.04');
if (!map[ver]) {
    log.error('无效输入 / Invalid input');
    exit(1);
}
log.info('开始运行 HydroOJ 安装工具 / Starting HydroOJ installation tool');
const MINIO_ACCESS_KEY = randomstring(32);
const MINIO_SECRET_KEY = randomstring(32);
const DATABASE_PASSWORD = randomstring(32);

function execWithNvm(str, env = {}) {
    exec(`/root/.nvm/nvm.sh && ${str}`, env);
}
function logAndRun(str, env = {}) {
    log.info('# %s', str);
    exec(str, env);
}
function logAndRunWithNvm(str, env = {}) {
    log.info('# %s', str);
    execWithNvm(str, env);
}

log.info('准备开始安装 / Preparing install');
logAndRun('apt-get -qq update');
logAndRun('apt-get install -y curl wget gnupg >/dev/null');
logAndRun('wget -qO - https://www.mongodb.org/static/pgp/server-4.4.asc | apt-key add -');
logAndRun(`echo "deb [ arch=amd64 ] ${MONGODB_REPO} ${map[ver]}/mongodb-org/4.4 multiverse" | tee /etc/apt/sources.list.d/mongodb-org-4.4.list`);
logAndRun('apt-get -qq update');
logAndRun('mkdir -p /data/db /data/file ~/.hydro');
logAndRun('正在安装 NodeJS / Installing NodeJS');
const resp = http.request('GET', 'https://cdn.jsdelivr.net/gh/nvm-sh/nvm@v0.36.0/install.sh');
const script = resp.body.replace(/raw\.githubusercontent\.com\/nvm-sh\/nvm\//g, 'cdn.jsdelivr.net/gh/nvm-sh/nvm@');
fs.writefile('/tmp/install-nvm.sh', script);
logAndRun('bash /tmp/install-nvm.sh');
execWithNvm('nvm install 14', { NVM_NODEJS_ORG_MIRROR });
execWithNvm('nvm use 14');
logAndRunWithNvm('npm i yarn -g');
log.info('正在安装 pm2 / Installing pm2');
logAndRunWithNvm('yarn global add pm2');
if (!cli.bool('skipMongo')) {
    log.info('正在安装 MongoDB / Installing MongoDB');
    logAndRun('apt-get -qq install -y mongodb-org');
    logAndRunWithNvm('pm2 start mongod');
    sleep(5000);
    log.info('正在创建数据库用户 / Creating database user');
    fs.writefile('/tmp/createUser.js', `\
      db.createUser({
        user: 'hydro',
        pwd: '${DATABASE_PASSWORD}',
        roles: [{ role: 'readWrite', db: 'hydro' }]
      })`);
    logAndRun('mongo 127.0.0.1:27017/hydro /tmp/createUser.js');
    logAndRunWithNvm('pm2 stop mongod');
    logAndRunWithNvm('pm2 del mongod');
    log.info('正在启动 MongoDB / Starting MongoDB');
    logAndRunWithNvm('pm2 start "mongod --auth --bind_ip 0.0.0.0" --name mongodb');
}
if (!cli.bool('skipMinio')) {
    log.info('正在安装 MinIO / Installing MinIO');
    if (!fs.exist('/usr/bin/minio')) {
        http.download(MINIO_DOWNLOAD, '/usr/bin/minio');
    }
    exec('chmod +x /usr/bin/minio');
    logAndRunWithNvm(`pm2 start "MINIO_ACCESS_KEY=${MINIO_ACCESS_KEY} MINIO_SECRET_KEY=${MINIO_SECRET_KEY} minio server /data/file" --name minio`);
}
log.info('正在安装编译器 / Installing compiler');
logAndRun('apt-get install -y g++ >/dev/null');

log.info('正在安装 HydroOJ / Installing HydroOJ');
logAndRunWithNvm('yarn global add hydrooj @hydrooj/ui-default @hydrooj/hydrojudge');
http.download('https://github.com/criyle/go-judge/releases/download/v1.0.5/executorserver-amd64', '/usr/bin/sandbox');
exec('chmod +x /usr/bin/sandbox');
logAndRunWithNvm('pm2 start sandbox');
fs.writefile('/root/.hydro/config.json', JSON.stringify({
    host: '127.0.0.1',
    port: 27017,
    name: 'hydro',
    username: 'hydro',
    password: DATABASE_PASSWORD,
}));
fs.writefile('/root/.hydro/addon.json', '["@hydrooj/ui-default","@hydrooj/hydrojudge"]');
fs.writefile('/root/.hydro/env', `MINIO_ACCESS_KEY=${MINIO_ACCESS_KEY}
MINIO_SECRET_KEY=${MINIO_SECRET_KEY}`);
logAndRunWithNvm('pm2 start hydrooj');
logAndRunWithNvm('pm2 startup');
logAndRunWithNvm('pm2 save');
log.info('安装完成 / Install done');
log.info('数据库用户名：hydro / Database username: hydro');
log.info('数据库密码：%s / Database password: %s', DATABASE_PASSWORD, DATABASE_PASSWORD);
log.info('MINIO_ACCESS_KEY=%s', MINIO_ACCESS_KEY);
log.info('MINIO_SECRET_KEY=%s', MINIO_SECRET_KEY);
