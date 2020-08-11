import 'hydrooj';
import { connect, dispose } from './db';

const DOMAIN_ID = 'system';
const TITLE = 'dummy_title';
const CONTENT = 'dummy_content';
const UID = 22;
const PNAME = 'aaa';

describe('Model.Problem', () => {
    let problem: typeof import('hydrooj/src/model/problem');

    beforeAll(async () => {
        await connect();
        problem = require('hydrooj/src/model/problem');
    });

    test('add_get', async () => {
        const pid = await problem.add(DOMAIN_ID, PNAME, TITLE, CONTENT, UID);
        let pdoc = await problem.get(DOMAIN_ID, PNAME);
        expect(pdoc.domainId).toStrictEqual(DOMAIN_ID);
        expect(pdoc.title).toStrictEqual(TITLE);
        expect(pdoc.content).toStrictEqual(CONTENT);
        expect(pdoc.owner).toStrictEqual(UID);
        expect(pdoc.docId).toStrictEqual(pid);
        expect(pdoc.pid).toStrictEqual(PNAME);
        pdoc = await problem.get(DOMAIN_ID, pid);
        expect(pdoc.domainId).toStrictEqual(DOMAIN_ID);
        expect(pdoc.title).toStrictEqual(TITLE);
        expect(pdoc.content).toStrictEqual(CONTENT);
        expect(pdoc.owner).toStrictEqual(UID);
        expect(pdoc.docId).toStrictEqual(pid);
        expect(pdoc.pid).toStrictEqual(PNAME);
        const pdocs = await problem.getMulti(DOMAIN_ID, {}).toArray();
        expect(pdocs.length).toStrictEqual(1);
        expect(pdocs[0].docId).toStrictEqual(pid);
        expect(pdocs[0].title).toStrictEqual(TITLE);
    });

    afterAll(dispose);
})