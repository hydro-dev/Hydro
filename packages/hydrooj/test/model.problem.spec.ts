import 'hydrooj/src/loader';

import { connect, dispose } from './db';

jest.setTimeout(30000);

const DOMAIN_ID = 'system';
const TITLE = 'dummy_title';
const CONTENT = 'dummy_content';
const CONTENT_1 = 'another_dummy_content';
const UID = 22;
const PNAME = 'aaa';

describe('Model.Problem', () => {
    let problem: typeof import('hydrooj/src/model/problem').default;

    beforeAll(async () => {
        await connect();
        problem = require('hydrooj/src/model/problem').default;
    });

    test('add_get', async () => {
        const pid = await problem.add(DOMAIN_ID, PNAME, TITLE, CONTENT, UID);
        expect(pid).toBeTruthy();
        const pdoc = await problem.get(DOMAIN_ID, PNAME);
        expect(pdoc.domainId).toStrictEqual(DOMAIN_ID);
        expect(pdoc.title).toStrictEqual(TITLE);
        expect(pdoc.content).toStrictEqual(CONTENT);
        expect(pdoc.owner).toStrictEqual(UID);
        expect(pdoc.docId).toStrictEqual(pid);
        expect(pdoc.pid).toStrictEqual(PNAME);
        const pdoc1 = await problem.get(DOMAIN_ID, pid);
        expect(pdoc1).toStrictEqual(pdoc);
        const pdocs = await problem.getMulti(DOMAIN_ID, {}).toArray();
        expect(pdocs.length).toStrictEqual(1);
        expect(pdocs[0].docId).toStrictEqual(pid);
        expect(pdocs[0].title).toStrictEqual(TITLE);
    });

    test('edit', async () => {
        const pid = await problem.add(DOMAIN_ID, PNAME, TITLE, CONTENT, UID);
        const pdoc = await problem.edit(DOMAIN_ID, pid, { content: CONTENT_1 });
        expect(pdoc.content).toStrictEqual(CONTENT_1);
    });

    /* FIXME doesn't work as storage isn't mocked yet
    test('del', async () => {
        const pid = await problem.add(DOMAIN_ID, PNAME, TITLE, CONTENT, UID);
        let pdocs = await problem.getMulti(DOMAIN_ID, {}).toArray();
        let count = pdocs.length;
        await problem.del(DOMAIN_ID, pid);
        pdocs = await problem.getMulti(DOMAIN_ID, {}).toArray();
        expect(pdocs.length).toStrictEqual(count - 1);
    })
    */

    afterAll(dispose);
});
