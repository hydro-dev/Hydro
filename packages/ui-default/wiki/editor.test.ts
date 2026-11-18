import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { PERM, PRIV } from '@hydrooj/common';
import type { Handler } from 'hydrooj';
import { Db, MongoClient } from 'mongodb';
import { MongoMemoryServer } from 'mongodb-memory-server';
import { after, before, test } from 'node:test';
import { Environment } from 'nunjucks';

let mongo: MongoMemoryServer;
let client: MongoClient;
let db: Db;
let wiki: typeof import('./handler');

const sampleSlugs = ['binary-search', 'dsu', 'bfs', 'dijkstra']
  .filter((slug) => existsSync(join(__dirname, 'articles', `${slug}.md`)));

const data = {
  slug: 'two-pointers',
  title: '双指针',
  category: '基础算法',
  summary: '有序数组的双指针技巧。',
  markdown: '## 示例\n\n使用滑动窗口。\n\n~~~cpp\nint left = 0;\n~~~\n',
};

before(async () => {
  const uri = process.env.HGNUOJ_TEST_MONGO_URI;
  if (!uri) mongo = await MongoMemoryServer.create();
  client = await MongoClient.connect(uri || mongo.getUri());
  db = client.db(`hgnuoj_wiki_test_${randomUUID().replace(/-/g, '')}`);
  require('hydrooj/src/init');
  app.provide('db');
  app.set('db', { collection: db.collection.bind(db) });
  wiki = require('./handler');
});

after(async () => {
  try {
    if (db && /^hgnuoj_wiki_test_[a-f0-9]{32}$/.test(db.databaseName)) await db.dropDatabase();
  } finally {
    await client?.close();
    await mongo?.stop();
  }
});

function handler<T extends Handler>(Type: new (...args: any[]) => T, {
  domainId = 'alpha', assertedDomain = domainId, uid = 42, privileged = uid > 0,
  permissions = PERM.PERM_VIEW | PERM.PERM_EDIT_WIKI, slug = '', body = {}, query = {},
  headers = {},
} = {}) {
  const response = {};
  const params = { slug };
  const args = { domainId: assertedDomain };
  const request = { body, headers, host: 'hgnuoj.test' };
  const context = { protocol: 'https', params, query, session: { uid }, HydroContext: { response, UiContext: {}, args, request } };
  const h = new Type(context, app);
  const { PermissionError, PrivilegeError } = require('hydrooj') as typeof import('hydrooj');
  Object.assign(h, {
    domain: { _id: domainId },
    user: {
      _id: uid,
      hasPriv: (priv: number) => priv === PRIV.PRIV_USER_PROFILE && privileged,
      hasPerm: (perm: bigint) => (permissions & perm) === perm,
    },
    checkPriv(priv: number) {
      if (!h.user.hasPriv(priv)) throw new PrivilegeError(priv);
    },
    checkPerm(perm: bigint) {
      if (!h.user.hasPerm(perm)) throw new PermissionError(perm);
    },
    url: (name, urlArgs) => `/d/${urlArgs.domainId}/wiki/${name === 'wiki_directory' ? 'directory' : urlArgs.slug}`,
  });
  return h;
}

function renderWikiTemplate(name: string, body: Record<string, unknown>) {
  const template = readFileSync(join(__dirname, '../templates', `${name}.html`), 'utf8').replace(/^\{% extends .* %\}\s*/, '');
  return new Environment(null, { autoescape: true }).renderString(template, {
    ...body, url: () => '#',
  });
}

test('Edit Wiki is grantable and excluded from the built-in reader roles', () => {
  const { PERMS } = require('hydrooj') as typeof import('hydrooj');
  assert.notEqual(PERM.PERM_EDIT_WIKI, 0n);
  assert.equal(PERM.PERM_BASIC & PERM.PERM_EDIT_WIKI, 0n);
  assert.equal(PERM.PERM_DEFAULT & PERM.PERM_EDIT_WIKI, 0n);
  assert.equal(PERMS.filter(({ family, key }) => family === 'perm_general' && key === PERM.PERM_EDIT_WIKI).length, 1);
});

test('only signed-in users granted Edit Wiki can open or submit either form', async () => {
  for (const [Type, slug] of [[wiki.WikiCreateHandler, data.slug], [wiki.WikiEditHandler, data.slug]] as const) {
    const anonymous = handler(Type, { uid: 0, privileged: true, slug, body: data });
    await assert.rejects(anonymous.get(), { name: 'PrivilegeError' });
    await assert.rejects(anonymous.post(), { name: 'PrivilegeError' });
    const reader = handler(Type, { permissions: PERM.PERM_DEFAULT, slug, body: data });
    await assert.rejects(reader.get(), { name: 'PermissionError' });
    await assert.rejects(reader.post(), { name: 'PermissionError' });
    const wrongDomain = handler(Type, { assertedDomain: 'another', slug, body: data });
    await assert.rejects(wrongDomain.get(), { name: 'NotFoundError' });
    await assert.rejects(wrongDomain.post(), { name: 'NotFoundError' });
  }
  const domainId = 'wiki-editor-permissions';
  await handler(wiki.WikiCreateHandler, { domainId, body: data }).post();
  const reader = handler(wiki.WikiArticleHandler, { domainId, permissions: PERM.PERM_DEFAULT, slug: data.slug });
  await reader.get();
  const editor = handler(wiki.WikiArticleHandler, { domainId, slug: data.slug });
  await editor.get();
  const render = (body: Record<string, unknown>) => renderWikiTemplate('wiki_main', body);
  assert.doesNotMatch(render(reader.response.body), /新建文章|编辑文章/);
  assert.match(render(editor.response.body), /新建文章/);
  assert.match(render(editor.response.body), /编辑文章/);
});

test('create and edit publish scoped articles with search, headings and rendered code', async () => {
  const create = handler(wiki.WikiCreateHandler, { body: data });
  await create.get();
  assert.equal(create.response.template, 'wiki_edit.html');
  await create.post();
  assert.equal(create.response.redirect, '/d/alpha/wiki/two-pointers');

  const edit = handler(wiki.WikiEditHandler, {
    slug: 'two-pointers', body: { ...data, slug: 'replacement-slug', title: '滑动窗口' },
  });
  await edit.get();
  assert.deepEqual(edit.response.body.article, data);
  await edit.post();

  const published = handler(wiki.WikiArticleHandler, { slug: data.slug });
  await published.get();
  const { article } = published.response.body;
  assert.equal(article.title, '滑动窗口');
  assert.match(article.html, /<pre><code class="language-cpp">/);
  assert.deepEqual(article.headings.map((h) => decodeURIComponent(h.href)), ['#示例']);
  assert.match(article.html, /id="示例"/);

  const results = handler(wiki.WikiIndexHandler, { query: { q: '滑动窗口' } });
  await results.get();
  assert.deepEqual(results.response.body.results.map((a) => a.slug), [data.slug]);

  const other = handler(wiki.WikiArticleHandler, { domainId: 'beta', slug: data.slug });
  await assert.rejects(other.get(), { name: 'NotFoundError' });
  await handler(wiki.WikiCreateHandler, { domainId: 'beta', body: data }).post();
});

test('editing a bundled article preserves its fallback and aliases in other domains', {
  skip: !sampleSlugs.includes('bfs'),
}, async () => {
  const edit = handler(wiki.WikiEditHandler, { slug: 'bfs', body: { ...data, title: '域内文章' } });
  await edit.get();
  assert.match(edit.response.body.article.markdown, /# /);
  await edit.post();

  const here = handler(wiki.WikiArticleHandler, { slug: 'bfs' });
  const other = handler(wiki.WikiArticleHandler, { domainId: 'beta', slug: 'bfs' });
  await Promise.all([here.get(), other.get()]);
  assert.equal(here.response.body.article.title, '域内文章');
  assert.match(other.response.body.article.title, /BFS/);

  const results = handler(wiki.WikiIndexHandler, { query: { q: 'breadth first search' } });
  await results.get();
  assert.deepEqual(results.response.body.results.map((a) => a.slug), ['bfs']);
  assert.equal(results.response.body.categories.flatMap((c) => c.articles).filter((a) => a.slug === 'bfs').length, 1);
});

test('invalid fields, reserved addresses, duplicate creates and unknown edits cannot overwrite articles', async () => {
  for (const fields of [
    { slug: 'help' }, { slug: 'about' }, { slug: 'new' }, { slug: 'bad\n' },
    { slug: '../bfs' }, { slug: ['valid'] }, { title: '  ' }, { category: 'a\nb' },
    { summary: 'x'.repeat(241) }, { markdown: ' \r\n' }, { markdown: '满'.repeat(21846) },
  ]) {
    const invalid = handler(wiki.WikiCreateHandler, { body: { ...data, ...fields } });
    await assert.rejects(invalid.post(), { name: 'ValidationError' });
  }

  const body = { ...data, slug: 'unique' };
  const attempts = await Promise.allSettled([
    handler(wiki.WikiCreateHandler, { body }).post(),
    handler(wiki.WikiCreateHandler, { body }).post(),
  ]);
  assert.equal(attempts.filter(({ status }) => status === 'fulfilled').length, 1);
  assert.equal(attempts.find((a) => a.status === 'rejected').reason.code, 409);

  const missing = handler(wiki.WikiEditHandler, { slug: 'missing', body: data });
  await assert.rejects(missing.get(), { name: 'NotFoundError' });
  await assert.rejects(missing.post(), { name: 'NotFoundError' });
});

test('editor rejects cross-origin browser submissions and escapes article metadata and Markdown', async () => {
  const body = { ...data, slug: 'escaped', title: '<remark>', markdown: '## 安全\n\n</textarea><remark>\n\n@[video](https://example.com/demo.mp4)' };
  const crossOrigin = handler(wiki.WikiCreateHandler, { body, headers: { origin: 'https://example.com' } });
  await assert.rejects(crossOrigin.post(), { name: 'CsrfTokenError' });
  await handler(wiki.WikiCreateHandler, { body, headers: { origin: 'https://hgnuoj.test' } }).post();
  const edit = handler(wiki.WikiEditHandler, { slug: body.slug });
  await edit.get();
  const html = renderWikiTemplate('wiki_edit', edit.response.body);
  assert.match(html, /&lt;remark&gt;/);
  assert.match(html, /&lt;\/textarea&gt;/);
  const view = handler(wiki.WikiArticleHandler, { slug: body.slug });
  await view.get();
  assert.doesNotMatch(view.response.body.article.html, /<(?:remark|video|source|iframe)\b/i);
});

test('directory route precedes the article fallback and its management link is editor only', async () => {
  const routes: [string, string, unknown][] = [];
  wiki.registerWikiRoutes({
    inject: () => {},
    Route: (...args) => routes.push(args),
  } as any);
  const i = routes.findIndex(([name]) => name === 'wiki_directory');
  assert.ok(i >= 0 && i < routes.findIndex(([name]) => name === 'wiki_article'));
  assert.deepEqual(routes[i], ['wiki_directory', '/wiki/directory', wiki.WikiDirectoryHandler]);

  const reader = handler(wiki.WikiIndexHandler, { permissions: PERM.PERM_DEFAULT });
  const editor = handler(wiki.WikiIndexHandler);
  await Promise.all([reader.get(), editor.get()]);
  assert.doesNotMatch(renderWikiTemplate('wiki_main', reader.response.body), /管理目录/);
  assert.match(renderWikiTemplate('wiki_main', editor.response.body), /管理目录/);
  await assert.rejects(handler(wiki.WikiCreateHandler, { body: { ...data, slug: 'directory' } }).post(),
    { name: 'ValidationError' });
});

const directoryHeaders = { origin: 'https://hgnuoj.test' };

function sampleFields() {
  return Object.fromEntries(sampleSlugs.map((slug) => [`slug-${slug}`, { category: '参考文章', order: '' }]));
}

test('the directory includes every available bundled article before any is edited', {
  skip: !sampleSlugs.length,
}, async () => {
  const domainId = 'wiki-directory-bundled';
  const form = handler(wiki.WikiDirectoryHandler, { domainId });
  await form.get();
  assert.deepEqual(form.response.body.directory.map(({ slug }) => slug), sampleSlugs);
  const entries = sampleFields();
  entries[`slug-${sampleSlugs.at(-1)}`] = { category: '置顶参考', order: '0' };
  const save = handler(wiki.WikiDirectoryHandler, { domainId, headers: directoryHeaders, body: { entries } });
  await save.post();
  await form.get();
  assert.equal(form.response.body.directory[0].slug, sampleSlugs.at(-1));
  assert.equal(form.response.body.categories[0].name, '置顶参考');
  assert.equal(await db.collection('wiki.article').countDocuments({ domainId }), 0);
  await assert.rejects(handler(wiki.WikiCreateHandler, { body: { ...data, slug: sampleSlugs[0] } }).post(), { code: 409 });
});

test('directory saves order and category per domain and keep search and Markdown headings', async () => {
  const domainId = 'wiki-directory';
  const manage = (body = {}) => handler(wiki.WikiDirectoryHandler, { domainId, body, headers: directoryHeaders });
  const slugs = ['local-one', 'local-two', 'local-three', 'local-four'];
  for (const slug of slugs) {
    await handler(wiki.WikiCreateHandler, { domainId, body: { ...data, slug, title: slug, category: '默认分类' } }).post();
  }
  const form = manage();
  await form.get();
  assert.deepEqual(form.response.body.directory.map(({ slug }) => slug), [
    ...sampleSlugs, 'local-four', 'local-one', 'local-three', 'local-two',
  ]);

  const entries = {
    ...sampleFields(),
    'slug-local-one': { category: '专题 <精选>', order: '20' },
    'slug-local-two': { category: '基础专题', order: '5' },
    'slug-local-three': { category: '专题 <精选>', order: '1' },
    'slug-local-four': { category: '基础专题', order: '5' },
  };
  const save = manage({ entries });
  await save.post();
  assert.equal(save.response.redirect, '/d/wiki-directory/wiki/directory');
  await handler(wiki.WikiCreateHandler, { domainId, body: { ...data, slug: 'new-article', category: '新文章' } }).post();

  await form.get();
  assert.deepEqual(form.response.body.directory.map(({ slug, order }) => [slug, order]), [
    ['local-three', 1], ['local-four', 5], ['local-two', 5], ['local-one', 20],
    ...sampleSlugs.map((slug) => [slug, null]), ['new-article', null],
  ]);
  const html = renderWikiTemplate('wiki_main', form.response.body);
  assert.match(html, /name="entries\[slug-local-three\]\[order\]"[^>]*value="1"/);
  assert.match(html, /value="专题 &lt;精选&gt;"/);
  const index = handler(wiki.WikiIndexHandler, { domainId, query: { q: 'local-three 精选' } });
  const other = handler(wiki.WikiIndexHandler, { domainId: 'other-directory' });
  const article = handler(wiki.WikiArticleHandler, { domainId, slug: 'local-three' });
  await Promise.all([index.get(), other.get(), article.get()]);
  const groups = ({ response }) => response.body.categories.map(({ name, articles }) => [name, articles.map(({ slug }) => slug)]);
  assert.deepEqual(groups(index), [
    ['专题 <精选>', ['local-three', 'local-one']],
    ['基础专题', ['local-four', 'local-two']],
    ...(sampleSlugs.length ? [['参考文章', sampleSlugs]] : []),
    ['新文章', ['new-article']],
  ]);
  assert.deepEqual(groups(article), groups(index));
  assert.doesNotMatch(JSON.stringify(groups(other)), /专题|local-three|参考文章/);
  assert.deepEqual(index.response.body.results.map(({ slug }) => slug), ['local-three']);
  assert.deepEqual(article.response.body.article.headings.map(({ href }) => decodeURIComponent(href)), ['#示例']);
  assert.equal(article.response.body.article.category, '专题 <精选>');
  assert.match(renderWikiTemplate('wiki_main', article.response.body), /本页目录/);
  assert.equal(await db.collection('wiki.article').countDocuments({ domainId }), 5);
});

test('directory requests enforce editor permissions, routed domain and same-origin submissions', async () => {
  const domainId = 'wiki-directory-permissions';
  await handler(wiki.WikiCreateHandler, { domainId, body: data }).post();
  const entries = { ...sampleFields(), [`slug-${data.slug}`]: { category: '导航分类', order: '0' } };
  const create = (options = {}) => handler(wiki.WikiDirectoryHandler, {
    domainId, headers: directoryHeaders, body: { entries }, ...options,
  });
  for (const [options, name] of [
    [{ uid: 0 }, 'PrivilegeError'],
    [{ permissions: PERM.PERM_DEFAULT }, 'PermissionError'],
    [{ assertedDomain: 'other-directory' }, 'NotFoundError'],
  ] as const) {
    const request = create(options);
    await assert.rejects(request.get(), { name });
    await assert.rejects(request.post(), { name });
  }
  for (const headers of [{}, { origin: 'null' }, { origin: 'https://elsewhere.test' }, { referer: 'https://elsewhere.test/wiki' }]) {
    await assert.rejects(create({ headers }).post(), { name: 'CsrfTokenError' });
  }
  await create({ headers: { referer: 'https://hgnuoj.test/wiki/directory' } }).post();
});

test('invalid directory lists and fields do not replace a saved directory', async () => {
  const domainId = 'wiki-directory-validation';
  const submit = (body: Record<string, unknown>) => handler(wiki.WikiDirectoryHandler, {
    domainId, headers: directoryHeaders, body,
  }).post();
  await handler(wiki.WikiCreateHandler, { domainId, body: data }).post();
  await handler(wiki.WikiCreateHandler, { domainId: 'other-directory', body: { ...data, slug: 'other-domain-only' } }).post();
  const remaining = sampleFields();
  const row = { category: '导航分类', order: '5' };
  const key = `slug-${data.slug}`;
  await submit({ entries: { ...remaining, [key]: row } });
  for (const entries of [
    null, [], {}, remaining, { ...remaining, 'other-domain-only': row }, { ...remaining, '../article': row },
    { ...remaining, [key]: [row, row] }, { ...remaining, [key]: { ...row, extra: 'x' } },
    ...[
      { category: ' ' }, { category: 'x'.repeat(51) }, { category: 'a\nb' }, { category: ['a', 'b'] },
      { order: ['1', '2'] }, { order: '1e2' }, { order: '-1' }, { order: '1000000' }, { order: '1.5' },
    ].map((fields) => ({ ...remaining, [key]: { ...row, ...fields } })),
  ]) {
    await assert.rejects(submit({ entries }), { name: 'ValidationError' });
  }
  const request = handler(wiki.WikiDirectoryHandler, { domainId });
  await request.get();
  assert.equal(request.response.body.directory.find(({ slug }) => slug === data.slug).order, 5);
});

test('an empty Wiki offers creation to editors and an empty hint to readers', async () => {
  const domainId = 'wiki-empty';
  const editor = handler(wiki.WikiIndexHandler, { domainId });
  const reader = handler(wiki.WikiIndexHandler, { domainId, permissions: PERM.PERM_DEFAULT });
  const directory = handler(wiki.WikiDirectoryHandler, { domainId });
  await Promise.all([editor.get(), reader.get(), directory.get()]);
  if (sampleSlugs.length) {
    // Exercise the empty template state even when the local reference files exist.
    editor.response.body.categories = [];
    reader.response.body.categories = [];
    directory.response.body.directory = [];
  }
  assert.match(renderWikiTemplate('wiki_main', editor.response.body), /新建文章/);
  const html = renderWikiTemplate('wiki_main', reader.response.body);
  assert.match(html, /暂时没有 Wiki 文章/);
  assert.doesNotMatch(html, /新建文章|管理目录/);
  assert.match(renderWikiTemplate('wiki_main', directory.response.body), /暂时没有可管理的文章/);
});
