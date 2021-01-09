/* eslint-disable no-constant-condition */
/* eslint-disable no-await-in-loop */
/*                        ..
                        .' @`._
         ~       ...._.'  ,__.-;
      _..- - - /`           .-'    ~
     :     __./'       ,  .'-'- .._
  ~   `- -(.-'''- -.    \`._       `.   ~
    _.- '(  .______.'.-' `-.`         `.
   :      `-..____`-.                   ;
   `.             ````  稻花香里说丰年，  ;   ~
     `-.__          听取人生经验。  __.-'
          ````- - -.......- - -'''    ~
       ~                   */
import fs from 'fs-extra';
import yaml from 'js-yaml';
import * as Session from './hosts/index';
import { sleep, Queue } from './utils';
import log from './log';

declare global {
    namespace NodeJS {
        interface Global {
            onDestory: Function[]
            hosts: any
        }
    }
}
if (!global.onDestory) global.onDestory = [];
if (!global.hosts) global.hosts = [];
let SI = false;

const { RETRY_DELAY_SEC, CONFIG_FILE, CONFIG } = require('./config');

const terminate = async () => {
    log.info('正在保存数据');
    try {
        await Promise.all(global.onDestory.map((f) => f()));
        process.exit(1);
    } catch (e) {
        if (SI) process.exit(1);
        log.error(e.stack);
        log.error('发生了错误。');
        log.error('再次按下 Ctrl-C 可强制退出。');
        SI = true;
    }
};
process.on('SIGINT', terminate);
process.on('SIGTERM', terminate);
process.on('unhandledRejection', (reason, p) => {
    console.log('Unhandled Rejection at: Promise ', p);
});

async function daemon() {
    let config;
    try {
        if (CONFIG) config = CONFIG;
        else {
            config = (await fs.readFile(CONFIG_FILE)).toString();
            config = yaml.load(config);
        }
    } catch (e) {
        log.error('配置文件无效或未找到。');
        process.exit(1);
    }
    const hosts = {};
    const queue = new Queue<any>();
    for (const i in config.hosts) {
        config.hosts[i].host = i;
        hosts[i] = new Session[config.hosts[i].type || 'vj4'](config.hosts[i]);
        await hosts[i].init();
    }
    global.hosts = hosts;
    if (!CONFIG) {
        global.onDestory.push(async () => {
            const cfg = { hosts: {} };
            for (const i in hosts) {
                cfg.hosts[i] = {
                    host: i,
                    type: hosts[i].config.type || 'default',
                    uname: hosts[i].config.uname,
                    password: hosts[i].config.password,
                    server_url: hosts[i].config.server_url,
                };
                if (hosts[i].config.cookie) cfg.hosts[i].cookie = hosts[i].config.cookie;
                if (hosts[i].config.detail) cfg.hosts[i].detail = hosts[i].config.detail;
            }
            await fs.writeFile(CONFIG_FILE, yaml.dump(cfg));
        });
    }
    while ('Orz twd2') {
        try {
            for (const i in hosts) await hosts[i].consume(queue);
            while ('Orz iceb0y') {
                const [task] = await queue.get();
                task.handle();
            }
        } catch (e) {
            log.error(e, e.stack);
            log.info(`在 ${RETRY_DELAY_SEC} 秒后重试`);
            await sleep(RETRY_DELAY_SEC * 1000);
        }
    }
}

if (!module.parent) daemon();
export = daemon;
