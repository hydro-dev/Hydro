import assert from 'node:assert/strict';
import test from 'node:test';
const { allowedLanguageIds, problemLimits }: typeof import('./problem') = await import(
    new URL('./problem.ts', import.meta.url).href
);

test('problem, contest and both domains intersect; explicit restrictions permit a hidden local language', () => {
    const languages = {
        cpp: {},
        python: {},
        hidden: { hidden: true },
        remote: { remote: true },
        disabled: { disabled: true },
        _: {},
    };
    assert.deepEqual(allowedLanguageIds(languages), ['cpp', 'python']);
    assert.deepEqual(allowedLanguageIds(languages, ['cpp', 'hidden'], ['python', 'hidden'], ['cpp', 'hidden']), ['hidden']);
    assert.deepEqual(allowedLanguageIds(languages, [], undefined), []);
    assert.deepEqual(allowedLanguageIds(languages, ['cpp'], ['python']), []);
    assert.deepEqual(allowedLanguageIds(languages, ['remote', 'disabled']), []);
});

test('time/memory labels use parsed testcase limits, including ranges', () => {
    assert.deepEqual(problemLimits({ timeMin: 2500, timeMax: 2500, memoryMin: 512, memoryMax: 512 }), {
        time: '2.5s',
        memory: '512 MiB',
    });
    assert.deepEqual(problemLimits({ timeMin: 500, timeMax: 2000, memoryMin: 64, memoryMax: 256 }), {
        time: '0.5–2s',
        memory: '64–256 MiB',
    });
    assert.deepEqual(problemLimits({}), { time: '—', memory: '—' });
});
