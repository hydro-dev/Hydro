const assert = require('node:assert/strict');
const { test } = require('node:test');
const { mkdtemp, rm, readFile, writeFile, utimes } = require('node:fs/promises');
const { tmpdir } = require('node:os');
const { join } = require('node:path');
const sharp = require(require.resolve('sharp', { paths: [require('node:path').resolve(__dirname, '../packages/image-preview')] }));
const { load } = require('cheerio');
const { ImagePreviews, userFile, version } = require('../packages/image-preview/images.ts');

async function fixture(fn) {
    const directory = await mkdtemp(join(tmpdir(), 'hgnu-images-'));
    let reads = 0;
    const buffer = await sharp({ create: { width: 120, height: 80, channels: 4, background: '#84c0ff80' } }).png().toBuffer();
    const source = { path: 'user/3/test.png', _id: 'abc/original.png', size: buffer.length, lastModified: new Date(0) };
    const cache = new ImagePreviews(directory, async () => { reads++; return buffer; });
    try { await fn({ directory, buffer, source, cache, reads: () => reads }); }
    finally { await rm(directory, { recursive: true, force: true }); }
}

test('only exact local public user-file URLs are eligible', () => {
    assert.equal(userFile('/file/3/test%20image.png'), 'user/3/test image.png');
    for (const value of ['/p/1/file/test.png', '/contest/id/file/private/a.png', 'https://other/file/3/test.png',
        '//other/file/3/test.png', '/file/3/%2e%2e', '/file/3/a%2fb.png', '/file/3/a%5cb.png', '/file/3/test.png?key=secret']) {
        assert.equal(userFile(value), null, value);
    }
});

test('cache version changes for replacement files and copied storage links', () => {
    const a = { path: 'user/3/test.png', _id: 'a', size: 50 };
    assert.notEqual(version(a), version({ ...a, _id: 'b' }));
    assert.notEqual(version(a), version({ ...a, size: 51 }));
    assert.notEqual(version(a), version({ ...a, etag: 'changed' }));
    assert.equal(version(a), version({ ...a, _id: 'alias', link: 'a' }));
});

test('PNG previews preserve alpha and exact pixels and never upscale', async () => fixture(async ({ buffer, source, cache }) => {
    const output = await cache.derivative(source, 480);
    const info = await sharp(output).metadata();
    assert.equal(info.format, 'webp');assert.equal(info.width, 120);assert.equal(info.height, 80);assert.equal(info.hasAlpha, true);
    assert.deepEqual(await sharp(output).raw().toBuffer(), await sharp(buffer).raw().toBuffer());
}));

test('simultaneous requests generate a variant once; disk cache survives service restart', async () => fixture(async ({ directory, source, cache, reads }) => {
    const results = await Promise.all(Array.from({ length: 12 }, () => cache.derivative(source, 960)));
    assert.equal(new Set(results).size, 1);assert.equal(reads(), 2);
    const restored = new ImagePreviews(directory, () => { throw Error('Should use disk cache'); });
    assert.equal(await restored.derivative(source, 960), results[0]);
}));

test('only the first image is eager; HTML percentage widths and links survive', async () => fixture(async ({ source, cache }) => {
    const html = '<p><img src="/file/3/test.png"><img src="/file/3/test.png" width="49%"><a href="/target"><img src="/file/3/test.png"></a></p>';
    const $ = load(await cache.render(html, async () => [source]));
    const images = $('img');
    assert.equal(images.eq(0).attr('loading'), 'eager');assert.equal(images.eq(1).attr('loading'), 'lazy');
    assert.equal(images.eq(1).attr('width'), '49%');assert.equal(images.eq(1).attr('height'), '80');
    assert.match(images.eq(1).attr('style'), /aspect-ratio:120\/80/);
    assert.match(images.eq(1).attr('sizes'), /49vw/);assert.equal(images.eq(2).parent().attr('href'), '/target');
    assert.equal(images.eq(0).parent().attr('href'), '/file/3/test.png?noDisposition=true');
    assert.equal(images.eq(0).attr('srcset').split(',').length, 1); // no duplicate width descriptors for small originals
}));

test('Markdown and raw HTML use the same sanitized transformation; code examples stay escaped', async () => fixture(async ({ source, cache }) => {
    const { render } = require('../packages/ui-default/backendlib/markdown.js');
    const html = render('![a](/file/3/test.png)\n\n<img src="/file/3/test.png" width="30%" onerror="alert(1)">\n\n`<img src="/file/3/test.png">`');
    const $ = load(await cache.render(html, async () => [source]));
    assert.equal($('img').length, 2);assert.equal($('img[onerror]').length, 0);
    assert.equal($('img').eq(1).attr('width'), '30%');assert.ok($('code').text().includes('<img'));
}));

test('missing, external, vector and corrupt files retain their original source', async () => fixture(async ({ source, cache }) => {
    const html = '<img src="/file/3/missing.png"><img src="https://example.invalid/a.png"><img src="/file/3/a.svg">';
    const $ = load(await cache.render(html, async () => [{ ...source, path: 'user/3/a.svg' }]));
    assert.equal($('img').eq(0).attr('src'), '/file/3/missing.png');assert.equal($('img').eq(1).attr('src'), 'https://example.invalid/a.png');
    assert.equal($('img').eq(2).attr('src'), '/file/3/a.svg');
    const corrupt = new ImagePreviews('/unused', async () => Buffer.from('invalid'));
    assert.equal(await corrupt.dimensions(source), null);
}));

test('large images and unsupported sizes are rejected before decoding', async () => fixture(async ({ source, cache, reads }) => {
    assert.equal(await cache.dimensions({ ...source, size: 33 * 1024 * 1024 }), null);
    assert.equal(reads(), 0);await assert.rejects(cache.derivative(source, 99999));
}));

test('EXIF orientation is applied consistently to dimensions and previews', async () => fixture(async ({ directory, source }) => {
    const buffer = await sharp({ create: { width: 60, height: 40, channels: 3, background: 'red' } }).jpeg().withMetadata({ orientation: 6 }).toBuffer();
    const cache = new ImagePreviews(directory, async () => buffer);
    source = { ...source, path: 'user/3/rotated.jpg', size: buffer.length };
    const dimensions = await cache.dimensions(source);assert.equal(dimensions.width, 40);assert.equal(dimensions.height, 60);
    const output = await sharp(await cache.derivative(source, 480)).metadata();assert.equal(output.width, 40);assert.equal(output.height, 60);
}));

test('expired derivatives are pruned without touching unrelated files', async () => fixture(async ({ directory, source, cache }) => {
    const output = await cache.derivative(source, 480);
    await utimes(output, new Date(0), new Date(0));await writeFile(join(directory, 'unrelated.txt'), 'keep');
    await cache.prune(512 * 1024 * 1024);await assert.rejects(readFile(output));
    assert.equal((await readFile(join(directory, 'unrelated.txt'))).toString(), 'keep');
}));
