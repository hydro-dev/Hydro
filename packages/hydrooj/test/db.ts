import 'hydrooj/src/loader';
jest.mock('hydrooj/src/service/db');

export async function connect() {
    const db = require('hydrooj/src/service/db');
    await db.start({});
    const scripts = require('hydrooj/src/upgrade').default;
    let dbVer = 0;
    const expected = scripts.length;
    while (dbVer < expected) {
        const func = scripts[dbVer];
        dbVer++;
        if (func.toString().includes('_FRESH_INSTALL_IGNORE')) continue;
        await func();
    }
}

export async function dispose() {
    const db = require('hydrooj/src/service/db');
    await db.stop();
}
