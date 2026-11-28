import assert from 'node:assert/strict';
import test from 'node:test';
const { allowedLanguageIds, problemLimits, statementPdf }: typeof import('./problem') = await import(
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

test('statement PDF uses the only PDF or an explicit statement.pdf among several attachments', () => {
    const statement = { name: '题面.PDF', url: '/scoped/statement' };
    assert.equal(statementPdf([{ name: 'figure.png', url: '/figure' }, statement]), statement);
    const preferred = { name: 'Statement.PDF' };
    assert.equal(statementPdf([{ name: 'solutions.pdf' }, preferred]), preferred);
    assert.equal(statementPdf([{ name: 'english.pdf' }, { name: '中文.pdf' }]), undefined);
    assert.equal(statementPdf([{ name: 'statement.pdf.exe' }, { name: 'figure.png' }]), undefined);
    assert.equal(statementPdf([]), undefined);
});

test('the administrator can select any uploaded PDF and explicitly clear it without falling back to another file', () => {
    const chosen = { name: 'A - 贪吃的乐乐.PDF' };
    const files = [{ name: 'statement.pdf' }, chosen, { name: 'diagram.png' }];
    assert.equal(statementPdf(files, chosen.name), chosen);
    assert.equal(statementPdf(files, ''), undefined);
    assert.equal(statementPdf(files, 'deleted.pdf'), undefined);
    assert.equal(statementPdf(files, '../secret.pdf'), undefined);
    assert.equal(statementPdf(files, 'diagram.png'), undefined);
    assert.equal(statementPdf(files, 'a - 贪吃的乐乐.PDF'), undefined);
});
