import 'hydrooj';
jest.mock('hydrooj/src/service/db');

export async function connect() {
    await new Promise((resolve) => {
        const db = require('hydrooj/src/service/db');
        db.bus.once('connect', resolve);
    });
    const modelSystem = require('hydrooj/src/model/system');
    const scripts = require('hydrooj/src/upgrade');
    let dbVer = (await modelSystem.get('db.ver')) || 0;
    const expected = scripts.length;
    while (dbVer < expected) {
        await scripts[dbVer]();
        dbVer++;
        await modelSystem.set('db.ver', dbVer);
    }
}

export async function dispose() {
    const db = require('hydrooj/src/service/db');
    await Promise.all([
        db.getClient().close(),
        db.getClient2().close(),
        db.getDb().close(),
        db.getDb2().close(),
    ]);
}
