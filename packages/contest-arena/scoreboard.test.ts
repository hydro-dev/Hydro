import assert from 'node:assert/strict';
import test from 'node:test';
const { avatarImage, badgeTextColor, medalCounts, medalFor, safeLogo, summarize }: typeof import('./scoreboard') =
    await import(new URL('./scoreboard.ts', import.meta.url).href);

test('medal bands match the original contest, including shared ranks and zero solves', () => {
    const settings = medalCounts({ gold: 4, silver: 8, bronze: 16 });
    const medal = (rank: number, accept = 1) => medalFor({ rank, accept }, settings);
    assert.deepEqual(
        [1, 4, 5, 12, 13, 28, 29].map((rank) => medal(rank)),
        ['gold', 'gold', 'silver', 'silver', 'bronze', 'bronze', ''],
    );
    assert.equal(medal(1, 0), '');
    assert.equal(medalFor({ rank: '*', accept: 10, unrank: true }, settings), '');
});

test('summary counts judged/pending attempts and handles a zero-minute first solve', () => {
    const result = summarize(
        [
            {
                cells: [
                    { correct: true, time: 0, attempts: 1, pending: 0 },
                    { correct: false, attempts: 0, pending: 2 },
                ],
            },
            {
                cells: [
                    { correct: true, time: 8, attempts: 0, pending: 0 },
                    { correct: false, attempts: 3, pending: 0 },
                ],
            },
        ],
        2,
    );
    assert.deepEqual(result, [
        { solved: 2, rejected: 1, pending: 0, first: 0 },
        { solved: 0, rejected: 3, pending: 2, first: null },
    ]);
});

test('avatar images permit only public image paths and HTTPS URLs', () => {
    assert.equal(safeLogo('/arena-assets/logo/hgnu-logo.png'), '/arena-assets/logo/hgnu-logo.png');
    assert.equal(safeLogo('https://example.org/logo.png'), 'https://example.org/logo.png');
    for (const url of [
        'javascript:alert(1)',
        'data:image/svg+xml,x',
        '//example.org/x',
        '/\\example.org/x',
        'https://user:password@example.org/x',
        'http://example.org/x',
    ]) { assert.equal(safeLogo(url), ''); }
});

test('malformed configuration cannot invent medals or bypass logo validation', () => {
    const settings = medalCounts({ gold: -1, silver: 1.5, bronze: '10' });
    assert.deepEqual(settings, { gold: 0, silver: 0, bronze: 0 });
    assert.equal(medalFor({ rank: 1, accept: 10 }, settings), '');
});

test('problem badges choose legible foregrounds for the original ten colours', () => {
    assert.equal(badgeTextColor('#000000'), '#ffffff');
    assert.equal(badgeTextColor('#ff0000'), '#ffffff');
    assert.equal(badgeTextColor('#0062ff'), '#ffffff');
    assert.equal(badgeTextColor('#8cff00'), '#000000');
    assert.equal(badgeTextColor('#fff'), '#000000');
});

test('missing/failed avatars use the HGNU logo and Gravatar does not return its generic placeholder', () => {
    assert.equal(avatarImage(''), '/arena-assets/logo/hgnu-logo.png');
    assert.equal(avatarImage('https://example.org/avatar/hash?d=mm&s=64'), 'https://example.org/avatar/hash?d=404&s=64');
    assert.equal(avatarImage('//q1.qlogo.cn/g?b=qq&nk=12345&s=160'), 'https://q1.qlogo.cn/g?b=qq&nk=12345&s=160');
    assert.equal(avatarImage('/file/3/avatar.png'), '/file/3/avatar.png');
    assert.equal(avatarImage('javascript:alert(1)'), '/arena-assets/logo/hgnu-logo.png');
    assert.equal(
        avatarImage('https://dn-qiniu-avatar.qbox.me/avatar/1a49b5cf98405758f9f671da3f89d3a6?d=mm&s=64', true),
        'https://www.gravatar.com/avatar/1a49b5cf98405758f9f671da3f89d3a6?d=404&s=64',
    );
    assert.equal(avatarImage('', true), '/arena-assets/logo/hgnu-logo.png');
});
