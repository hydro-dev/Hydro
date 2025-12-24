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

import PQueue from 'p-queue';
import { fs } from '@hydrooj/utils';
import { getConfig } from './config';
import HydroHost from './hosts/hydro';
import Vj4Host from './hosts/vj4';
import log from './log';
import { versionCheck } from './sandbox';
import { initTracing } from './tracing';

const hosts: Record<string, HydroHost | Vj4Host> = {};
let exit = false;

const terminate = async () => {
    log.info('正在保存数据');
    try {
        await Promise.all(Object.values(hosts).map((f) => f.dispose?.()));
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

async function daemon() {
    const shouldRun = await versionCheck((msg) => log.error(msg));
    if (!shouldRun) process.exit(1);
    const tracing = getConfig('tracing');
    if (tracing?.endpoint && tracing?.samplePercentage) initTracing(tracing.endpoint, tracing.samplePercentage);
    const _hosts = getConfig('hosts');
    const queue = new PQueue({ concurrency: Infinity });
    await fs.ensureDir(getConfig('tmp_dir'));
    queue.on('error', (e) => log.error(e));
    for (const i in _hosts) {
        _hosts[i].host ||= i;
        hosts[i] = _hosts[i].type === 'vj4' ? new Vj4Host(_hosts[i]) : new HydroHost(_hosts[i]);
        await hosts[i].init();
    }
    for (const i in hosts) hosts[i].consume(queue);
}

if (require.main === module) daemon();
export = daemon;
