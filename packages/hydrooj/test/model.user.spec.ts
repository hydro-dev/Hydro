import 'hydrooj/src/loader';

import { PRIV } from 'hydrooj/src/model/builtin';
import * as bus from 'hydrooj/src/service/bus';
import { connect, dispose } from './db';

jest.setTimeout(30000);

describe('Model.User', () => {
    let user: typeof import('hydrooj/src/model/user').default;

    beforeAll(async () => {
        await connect();
        user = require('hydrooj/src/model/user').default;
        require('hydrooj/src/model/setting');
        await bus.serial('app/started');
    });

    test('create', async () => {
        const uid = await user.create('i@undefined.moe', 'undefined', '123456');
        expect(uid).toStrictEqual(2);
    });

    test('getById', async () => {
        const udoc = await user.getById('system', 2);
        expect(udoc.mail).toStrictEqual('i@undefined.moe');
    });

    test('getByEmail', async () => {
        const udoc = await user.getByEmail('system', 'i@undefined.moe');
        expect(udoc.uname).toStrictEqual('undefined');
    });

    test('getByUname', async () => {
        const udoc = await user.getByUname('system', 'undefined');
        expect(udoc.mail).toStrictEqual('i@undefined.moe');
    });

    test('createWithExtraArgs', async () => {
        const uid1 = await user.create('test@undefined.moe', 'test', '123456', -1, '127.0.0.1', -1);
        expect(uid1).toStrictEqual(-1);
    });

    test('getList', async () => {
        const udoc1 = await user.getList('system', [-1, 1]);
        expect(udoc1[-1].uname).toStrictEqual('test');
        expect(udoc1[-1].hasPriv(PRIV.PRIV_MANAGE_ALL_DOMAIN)).toStrictEqual(true);
    });

    test('getPrefixList', async () => {
        const udocs = await user.getPrefixList('system', 'u', 1);
        expect(udocs.length).toStrictEqual(1);
        expect(udocs[0].uname).toStrictEqual('undefined');
    });

    afterAll(dispose);
});
