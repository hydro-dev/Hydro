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
import * as Session from './hosts/index';
import { sleep, Queue } from './utils';
import { getConfig } from './config';
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

async function worker(queue: Queue<any>) {
    while ('Orz Soha') {
        const [task] = await queue.get();
        task.handle();
    }
}

async function daemon() {
    const _hosts = getConfig('hosts');
    const retry_delay_sec = getConfig('retry_delay_sec');
    const hosts = {};
    const queue = new Queue<any>();
    for (const i in _hosts) {
        _hosts[i].host = _hosts[i].host || i;
        hosts[i] = new Session[_hosts[i].type || 'vj4'](_hosts[i]);
        await hosts[i].init();
    }
    global.hosts = hosts;
    worker(queue);
    for (const i in hosts) {
        while ('Orz twd2') {
            try {
                await hosts[i].consume(queue);
                break;
            } catch (e) {
                log.error(e, e.stack);
                log.info(`在 ${retry_delay_sec} 秒后重试`);
                await sleep(retry_delay_sec * 1000);
            }
        }
    }
}

if (require.main === module) daemon();
export = daemon;
