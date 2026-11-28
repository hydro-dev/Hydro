import assert from 'node:assert/strict';
import test from 'node:test';
const { inlinePdfDisposition }: typeof import('./pdf') = await import(new URL('./pdf.ts', import.meta.url).href);

test('inline PDFs expose their real Chinese filenames with an ASCII fallback', () => {
    const name = 'A - 贪吃的乐乐 (正式).PDF';
    const header = inlinePdfDisposition(name);
    assert.match(header, /^inline; filename="statement\.pdf"; filename\*=UTF-8''/);
    assert.equal(decodeURIComponent(header.split("UTF-8''")[1]), name);
    assert(!/[^\x20-\x7E]/.test(header));
    assert(header.includes('%28') && header.includes('%29'));
});

test('filename punctuation and line breaks cannot inject Content-Disposition fields', () => {
    const name = 'a";\r\nx-test: injected*\'.pdf';
    const header = inlinePdfDisposition(name);
    assert.equal(decodeURIComponent(header.split("UTF-8''")[1]), name);
    assert.equal(header.split(';').length, 3);
    assert(!/[\r\n]/.test(header));
    assert(header.includes('%2A') && header.includes('%27'));
});
