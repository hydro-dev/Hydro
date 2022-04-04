import assert from 'assert';
import autocannon from 'autocannon';
import { writeFileSync } from 'fs-extra';
import * as supertest from 'supertest';
import * as bus from 'hydrooj/src/service/bus';

const Root = {
    username: 'root',
    password: '123456',
    creditionals: null,
};

describe('App', () => {
    let agent: supertest.SuperAgentTest;
    before('init', function init(done) {
        this.timeout(30000);
        bus.on('app/started', () => setTimeout(() => {
            agent = supertest.agent(require('hydrooj/src/service/server').server);
            done();
        }, 2000));
    });

    const routes = ['/', '/api', '/p', '/contest', '/homework', '/user/1', '/training'];
    routes.forEach((route) => it(`GET ${route}`, () => agent.get(route).expect(200)));

    it('API user', async () => {
        await agent.get('/api?{user(id:1){uname}}').expect({ data: { user: { uname: 'Hydro' } } });
        await agent.get('/api?{user(id:2){uname}}').expect({ data: { user: null } });
    });

    it('Create User', async () => {
        const redirect = await agent.post('/register')
            .send({ mail: 'test@example.com' })
            .expect(302)
            .then((res) => res.headers.location);
        await agent.post(redirect)
            .send({ uname: Root.username, password: Root.password, verifyPassword: Root.password })
            .expect(302);
    });

    it('Login', async () => {
        const cookie = await agent.post('/login')
            .send({ uname: Root.username, password: Root.password })
            .expect(302)
            .then((res) => res.headers['set-cookie']);
        Root.creditionals = cookie;
    });

    it('API registered user', async () => {
        await agent.get('/api?{user(id:2){uname}}').expect({ data: { user: { uname: 'root' } } });
    });

    // TODO add more tests

    const results: Record<string, autocannon.Result> = {};
    if (process.env.BENCHMARK) {
        routes.forEach((route) => it(`Performance test ${route}`, async function test() {
            this.timeout(60000);
            await global.Hydro.model.system.set('limit.global', 99999);
            const result = await autocannon({ url: `http://localhost:8888${route}` });
            assert(result.errors === 0, `test ${route} returns errors`);
            results[route] = result;
        }));
    }

    after(() => {
        const metrics = [];
        for (const key in results) {
            metrics.push({
                name: `Benchmark - ${key} - Req/sec`,
                unit: 'Req/sec',
                value: results[key].requests.average,
            });
        }
        writeFileSync('./benchmark.json', JSON.stringify(metrics, null, 2));
        setTimeout(() => process.exit(0), 1000);
    });
});
