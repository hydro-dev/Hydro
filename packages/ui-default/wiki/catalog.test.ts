import assert from 'node:assert/strict';
import { test } from 'node:test';
import { getAdjacentWikiArticles, getBundledWikiSource, getWikiCategories, renderWikiArticle, searchWiki, splitWikiAliases } from './catalog';

const sampleSlugs = ['binary-search', 'dsu', 'bfs', 'dijkstra'].filter((slug) => getBundledWikiSource(slug));

test('each catalog entry resolves to a unique article with working Markdown anchors and a C++ template', { skip: !sampleSlugs.length }, () => {
  const articles = getWikiCategories().flatMap((category) => category.articles);
  assert.deepEqual(articles.map(({ slug }) => slug), sampleSlugs);
  for (const { slug, title } of articles) {
    const article = renderWikiArticle(getBundledWikiSource(slug));
    assert.equal(article?.title, title);
    assert.match(article.html, /<pre><code class="language-cpp">/);
    const headingIds = [...article.html.matchAll(/<h[23] id="([^"]+)"/g)].map((match) => match[1]);
    assert.ok(headingIds.length >= 5);
    assert.equal(new Set(headingIds).size, headingIds.length);
    assert.deepEqual(article.headings.map(({ href }) => decodeURIComponent(href.slice(1))), headingIds);
  }
});

test('article lookup accepts only exact catalog slugs', () => {
  for (const slug of [
    'missing', 'help', 'about', 'BFS', ' bfs', 'bfs\n', '../bfs', 'bfs/../dsu', '%62fs',
    'bfs.md', 'constructor', '__proto__', ['bfs'], null, undefined,
  ]) {
    assert.equal(getBundledWikiSource(slug), undefined, JSON.stringify(slug));
  }
});

test('search normalizes input and finds Chinese titles, English aliases, and article prose', { skip: sampleSlugs.length !== 4 }, () => {
  const slugs = (query: unknown) => searchWiki(query).results.map(({ slug }) => slug);
  assert.deepEqual(slugs('  ｂＦｓ　 复杂度 '), ['bfs']);
  assert.deepEqual(slugs('并查集'), ['dsu']);
  assert.deepEqual(slugs('lower bound'), ['binary-search']);
  assert.equal(slugs('最短路')[0], 'dijkstra');
  assert.deepEqual(slugs('过期条目'), ['dijkstra']);
  assert.deepEqual(slugs('bfs dsu'), []);
  assert.deepEqual(slugs('zzzzz'), []);
});

test('search bounds reflected input and ignores blank or repeated query parameters', () => {
  assert.deepEqual(searchWiki(' \n\t '), { query: '', results: [] });
  assert.deepEqual(searchWiki(['bfs', 'dsu']), { query: '', results: [] });
  assert.equal(searchWiki('a'.repeat(101)).query.length, 100);
});

test('splitWikiAliases normalizes separators and removes duplicates', () => {
  assert.deepEqual(splitWikiAliases('DSU, union-find、并查集；DSU  连通性'), ['DSU', 'union-find', '并查集', '连通性']);
  assert.deepEqual(splitWikiAliases(''), []);
  assert.deepEqual(splitWikiAliases(undefined), []);
});

test('searchWiki matches custom article aliases and getAdjacentWikiArticles tracks reading order', () => {
  const articles = [
    { slug: 'kmp', title: 'KMP 字符串匹配', category: '字符串', summary: '线性时间前缀函数。', aliases: 'prefix function 前缀函数', markdown: '## 简介\n\nKMP。' },
    { slug: 'trie', title: '字典树', category: '字符串', summary: '高效存储前缀集合。', aliases: 'Trie, prefix tree', markdown: '## 简介\n\nTrie。' },
    { slug: 'seg', title: '线段树', category: '数据结构', summary: '区间修改与区间查询。', markdown: '## 简介\n\nSegment Tree。' },
  ];
  assert.deepEqual(searchWiki('prefix function', articles).results.map(({ slug }) => slug), ['kmp']);
  assert.deepEqual(searchWiki('prefix tree', articles).results.map(({ slug }) => slug), ['trie']);

  const categories = getWikiCategories(articles);
  const first = getAdjacentWikiArticles(categories, 'kmp');
  assert.equal(first.prevArticle, null);
  assert.equal(first.nextArticle?.slug, 'trie');

  const middle = getAdjacentWikiArticles(categories, 'trie');
  assert.equal(middle.prevArticle?.slug, 'kmp');
  assert.equal(middle.nextArticle?.slug, 'seg');

  const last = getAdjacentWikiArticles(categories, 'seg');
  assert.equal(last.prevArticle?.slug, 'trie');
  assert.equal(last.nextArticle, null);

  assert.deepEqual(getAdjacentWikiArticles(categories, 'missing'), { prevArticle: null, nextArticle: null });
});
