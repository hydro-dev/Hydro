import cluster from 'cluster';
import crypto from 'crypto';
import axios from 'axios';
import { safeDump } from 'js-yaml';
import db from './db';
import * as bus from './bus';
import * as sysinfo from '../lib/sysinfo';

const coll = db.collection('status');

function crypt(str: string) {
    const cipher = crypto.createCipheriv('des-ecb', 'hydro-oj', '');
    let encrypted = cipher.update(str, 'utf8', 'hex');
    encrypted += cipher.final('hex');
    return encrypted;
}

export async function feedback() {
    const {
        system, domain, document, user, record,
    } = global.Hydro.model;
    const version = require('hydrooj/package.json').version;
    const [mid, , inf] = await sysinfo.update();
    const [installid, name, url] = system.getMany([
        'installid', 'server.name', 'server.url',
    ]);
    const [domainCount, userCount, problemCount, discussionCount, recordCount] = await Promise.all([
        domain.getMulti().count(),
        user.getMulti().count(),
        document.coll.find({ docType: document.TYPE_PROBLEM }).count(),
        document.coll.find({ docType: document.TYPE_DISCUSSION }).count(),
        record.coll.find().count(),
    ]);
    const payload = crypt(safeDump({
        _id: installid + mid.toString(),
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
        flags: inf.flags,
    }));
    axios.post('https://feedback.undefined.moe/', { payload });
}

export async function update() {
    await feedback();
    const [mid, $set] = await sysinfo.update();
    $set.updateAt = new Date();
    $set.reqCount = global.Hydro.stat.reqCount;
    await bus.serial('monitor/update', 'server', $set);
    await coll.updateOne(
        { mid, type: 'server' },
        { $set },
        { upsert: true },
    );
    global.Hydro.stat.reqCount = 0;
}

export async function updateJudger(args) {
    const $set = { ...args, updateAt: new Date() };
    await bus.serial('monitor/update', 'judger', $set);
    return await coll.updateOne(
        { mid: args.mid, type: 'judger' },
        { $set },
        { upsert: true },
    );
}

if (cluster.isMaster) {
    bus.on('app/started', async () => {
        const info = await sysinfo.get();
        await coll.updateOne(
            { mid: info.mid, type: 'server' },
            { $set: { ...info, updateAt: new Date(), type: 'server' } },
            { upsert: true },
        );
        await feedback();
        setInterval(update, 60 * 1000);
    });
}

global.Hydro.service.monitor = { feedback, update, updateJudger };
