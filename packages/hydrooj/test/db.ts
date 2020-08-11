import 'hydrooj/src/utils';

jest.mock('hydrooj/src/service/db');

export async function connect() {
    await new Promise((resolve) => {
        const db = require('hydrooj/src/service/db');
        db.bus.once('connect', resolve);
    });
    const script = require('../src/script/upgrade0_1');
    await script.run();
}

export async function dispose() {
    const db = require('hydrooj/src/service/db');
    await db.getClient().close();
    await db.getDb().close();
}
