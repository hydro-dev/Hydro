/* eslint-disable import/no-duplicates */
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
import './utils';

import { getConfig } from './config';
import HydroHost from './hosts/hydro';
import log from './log';
import { Queue } from './utils';

declare global {
    namespace NodeJS {
        interface Global {
            onDestroy: Function[]
            hosts: any
        }
    }
}
global.onDestroy ||= [];
global.hosts ||= [];
let exit = false;

const terminate = async () => {
    log.info('正在保存数据');
    try {
        await Promise.all(global.onDestroy.map((f: Function) => f()));
        process.exit(1);
    } catch (e) {
        if (exit) process.exit(1);
        log.error(e.stack);
        log.error('发生了错误。');
        log.error('再次按下 Ctrl-C 可强制退出。');
        exit = true;
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
    const hosts = {};
    const queue = new Queue<any>();
    worker(queue).catch((e) => log.error(e));
    for (const i in _hosts) {
        _hosts[i].host = _hosts[i].host || i;
        hosts[i] = new HydroHost(_hosts[i]);
        await hosts[i].init();
    }
    for (const i in hosts) hosts[i].consume(queue);
    global.hosts = hosts;
}

if (require.main === module) daemon();
export = daemon;
