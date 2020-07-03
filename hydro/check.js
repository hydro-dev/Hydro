// TODO check more

const os = require('os');
const superagent = require('superagent');
const system = require('./model/system');
const db = require('./service/db');

const c = {};

async function checkDb(log, warn, error) {
    try {
        const coll = db.collection('check');
        const d = await coll.findOne({ _id: 'check' });
        if (!d) await coll.insertOne({ _id: 'check', value: 'check' });
        await coll.createIndex('check');
        await coll.deleteOne({ _id: 'check' });
    } catch (e) {
        error(`Mongo Error: Database read-write failed.\n${e.message}`);
    }
}

async function checkPerm(log, warn) {
    const { username } = os.userInfo();
    if (username === 'root') warn('Hydro should not be run as root.');
    // TODO check cwd read-write
}

async function checkMail(log, warn) {
    const from = await system.get('smtp.from');
    if (!from) warn('SMTP account was not provided, email verification disabled.');
}

async function checkProxy(log, warn) {
    const [github, google, proxy] = await system.getMany([
        'oauth.githubappid', 'oauth.googleappid', 'proxy',
    ]);
    if (proxy) {
        superagent.get('https://www.google.com/').timeout(10000).proxy(proxy)
            .catch(() => warn('The proxy configured seem to be invalid.'));
    } else if (github || google) {
        warn('OAuth enabled. But for well-known reasons, a proxy is required.');
    }
}

const checks = [
    checkDb,
    checkPerm,
    checkMail,
    checkProxy,
];

async function start(log, warn, error, cb) {
    const id = String.random(6);
    cb(id);
    for (const check of checks) {
        if (c[id]) {
            delete c[id];
            return;
        }
        // eslint-disable-next-line no-await-in-loop
        await check(log, warn, error);
    }
}

async function cancel(id) {
    c[id] = true;
}

module.exports = { start, cancel };
