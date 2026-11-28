import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import test from 'node:test';
const require = createRequire(import.meta.url);
require('@hydrooj/register');
const { clarificationNotices, readNotices }: typeof import('./notifications') = require('./notifications.ts');

test('announcements and jury replies notify, contestant questions and follow-ups do not', () => {
    const data = [
        { docId: 'broadcast', owner: 0, subject: 0, content: '开赛通知' },
        { docId: 'private', owner: 12, subject: 2164, content: '请问', reply: [
            { _id: 'r1', owner: 12, content: '追问' }, { _id: 'r2', owner: 0, content: '裁判回复' },
        ] },
    ];
    const notices = clarificationNotices(data, (did) => `/clarification?did=${did}`);
    assert.deepEqual(notices.map((item) => [item.body, item.url]), [
        ['开赛通知', '/clarification?did=broadcast'], ['裁判回复', '/clarification?did=private'],
    ]);
    const read = readNotices([], [notices[0].id]);
    assert.equal(notices.filter((item) => !read.includes(item.id)).length, 1);
    assert.deepEqual(readNotices(read, [notices[0].id]), read);
    assert.equal(clarificationNotices(data, () => '')[0].id, notices[0].id);
    data[0].content = '更正通知';
    assert.notEqual(clarificationNotices(data, () => '')[0].id, notices[0].id);
});
