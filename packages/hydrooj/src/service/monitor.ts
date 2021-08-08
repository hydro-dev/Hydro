import cluster from 'cluster';
import crypto from 'crypto';
import superagent from 'superagent';
import { dump } from 'js-yaml';
import * as sysinfo from '@hydrooj/utils/lib/sysinfo';
import type { StatusUpdate } from '@hydrooj/utils/lib/sysinfo';
import db from './db';
import * as bus from './bus';
import { Logger } from '../logger';

const coll = db.collection('status');
const logger = new Logger('monitor');

function crypt(str: string) {
    const cipher = crypto.createCipheriv('des-ecb', 'hydro-oj', ''); // lgtm [js/hardcoded-credentials]
    let encrypted = cipher.update(str, 'utf8', 'hex');
    encrypted += cipher.final('hex');
    return encrypted;
}

export async function feedback(): Promise<[string, StatusUpdate]> {
    const {
        system, domain, document, user, record,
    } = global.Hydro.model;
    const version = require('hydrooj/package.json').version;
    const [mid, $update, inf] = await sysinfo.update();
    const [installId, name, url] = system.getMany(['installid', 'server.name', 'server.url']);
    const [domainCount, userCount, problemCount, discussionCount, recordCount] = await Promise.all([
        domain.getMulti().count(),
        user.getMulti().count(),
        document.coll.find({ docType: document.TYPE_PROBLEM }).count(),
        document.coll.find({ docType: document.TYPE_DISCUSSION }).count(),
        record.coll.find().count(),
    ]);
    const payload = crypt(dump({
        mid: mid.toString(),
        version,
        name,
        url,
        domainCount,
        userCount,
        problemCount,
        discussionCount,
        recordCount,
        addons: global.addons,
        memory: inf.memory,
        osinfo: inf.osinfo,
        cpu: inf.cpu,
    }, {
        replacer: (key, value) => {
            if (typeof value === 'function') return '';
            return value;
        },
    }));
    superagent.post(`${system.get('server.center')}/report`)
        .send({ installId, payload })
        .then((res) => {
            if (res.body.updateUrl) system.set('server.center', res.body.updateUrl);
        })
        .catch(() => logger.warn('Cannot connect to hydro center.'));
    return [mid, $update];
}

export async function update() {
    const [mid, $update] = await feedback();
    const $set = {
        ...$update,
        updateAt: new Date(),
        reqCount: global.Hydro.stat.reqCount,
    };
    await bus.serial('monitor/update', 'server', $set);
    await coll.updateOne(
        { mid, type: 'server' },
        { $set },
        { upsert: true },
    );
    global.Hydro.stat.reqCount = 0;
}

export async function updateJudge(args) {
    const $set = { ...args, updateAt: new Date() };
    await bus.serial('monitor/update', 'judge', $set);
    return await coll.updateOne(
        { mid: args.mid, type: 'judge' },
        { $set },
        { upsert: true },
    );
}

if (cluster.isMaster) {
    bus.on('app/started', async () => {
        sysinfo.get().then((info) => {
            coll.updateOne(
                { mid: info.mid, type: 'server' },
                { $set: { ...info, updateAt: new Date(), type: 'server' } },
                { upsert: true },
            );
            feedback();
            setInterval(update, 60 * 1000);
        });
    });
}

global.Hydro.service.monitor = { feedback, update, updateJudge };
