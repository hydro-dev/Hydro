import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import type { MarkdownIt } from 'markdown-it';
import { ensureTag } from '../backendlib/markdown-it-xss';

const groups = [
  {
    name: '基础算法',
    entries: [
      ['binary-search', '二分查找', '在有序数组或单调的答案范围内找到分界线。', 'binary search lower bound 二分答案'],
    ],
  },
  {
    name: '数据结构',
    entries: [
      ['dsu', '并查集', '维护动态合并的集合，快速判断两点是否连通。', 'dsu union find disjoint set'],
    ],
  },
  {
    name: '图论',
    entries: [
      ['bfs', '广度优先搜索（BFS）', '逐层遍历图，求无权图中的最少步数。', 'bfs breadth first search 宽度优先搜索'],
      ['dijkstra', 'Dijkstra 最短路', '用最小堆求非负权图中的单源最短距离。', 'dijkstra single source shortest path sssp'],
    ],
  },
] as const;

export interface WikiLink {
  slug: string;
  title: string;
  summary: string;
  category: string;
}

export interface WikiSource extends WikiLink {
  markdown: string;
}

export interface WikiDirectoryEntry {
  slug: string;
  category: string;
  order: number | null;
}

interface Heading {
  href: string;
  title: string;
  level: number;
}

const { md }: { md: MarkdownIt } = require('../backendlib/markdown');
const bundled = new Map<string, WikiSource & { aliases: string }>();
const normalize = (text: string) => text.normalize('NFKC').toLowerCase();

for (const { name: category, entries } of groups) {
  for (const [slug, title, summary, aliases] of entries) {
    let markdown: string;
    try {
      markdown = readFileSync(join(__dirname, 'articles', `${slug}.md`), 'utf8');
    } catch (err) {
      // A release can ship the Wiki framework without these local references.
      if (err.code === 'ENOENT') continue;
      throw err;
    }
    bundled.set(slug, {
      slug, title, summary, category, markdown, aliases,
    });
  }
}

export function getBundledWikiSource(slug: unknown) {
  return typeof slug === 'string' ? bundled.get(slug) : undefined;
}

function wikiLink({ slug, title, summary, category }: WikiLink): WikiLink {
  return { slug, title, summary, category };
}

function withFallback<T extends WikiLink>(stored: readonly T[]) {
  return new Map<string, T | WikiSource>([
    ...bundled,
    ...stored.map((article) => [article.slug, article] as const),
  ]);
}

export function getWikiDirectory(stored: readonly WikiLink[], settings: readonly WikiDirectoryEntry[] = []) {
  const bySlug = new Map(settings.map((entry) => [entry.slug, entry]));
  const entries = [...withFallback(stored).values()].map((article) => {
    const saved = bySlug.get(article.slug);
    return { ...wikiLink(article), category: saved?.category ?? article.category, order: saved?.order ?? null };
  });
  // Keep the original catalog order for ties and articles without an explicit position.
  return entries.sort((a, b) => (a.order ?? Infinity) - (b.order ?? Infinity) || 0);
}

export function getWikiCategories(stored: readonly WikiLink[] = [], settings: readonly WikiDirectoryEntry[] = []) {
  const categories = new Map<string, WikiLink[]>();
  for (const article of getWikiDirectory(stored, settings)) {
    if (!categories.has(article.category)) categories.set(article.category, []);
    categories.get(article.category).push(wikiLink(article));
  }
  return [...categories].map(([name, articles]) => ({ name, articles }));
}

export function renderWikiArticle(source: WikiSource) {
  const env = {};
  const tokens = md.parse(source.markdown, env);
  const headings: Heading[] = [];
  tokens.forEach((token, i) => {
    for (const child of token.children || []) {
      // Keep the shared Markdown features and sanitizer, but do not render rich-media embeds in the Wiki.
      if (child.type === 'video') {
        child.type = 'text';
        child.content = child.attrGet('src')?.toString() || '';
      }
    }
    if (token.type !== 'heading_open' || !['h2', 'h3'].includes(token.tag)) return;
    const id = token.attrGet('id');
    if (typeof id !== 'string' || !id) return;
    // The shared anchor plugin percent-encodes the slug. Keep the DOM ID decoded for browser fragments.
    token.attrSet('id', decodeURIComponent(id));
    const label = (tokens[i + 1].children || [])
      .filter(({ type }) => type === 'text' || type === 'code_inline')
      .map(({ content }) => content).join('');
    headings.push({ href: `#${id}`, title: label, level: Number(token.tag[1]) });
  });
  return { ...wikiLink(source), headings, html: ensureTag(md.renderer.render(tokens, md.options, env)) };
}

export function searchWiki(input: unknown, stored: readonly WikiSource[] = [], settings: readonly WikiDirectoryEntry[] = []) {
  const query = typeof input === 'string'
    ? input.normalize('NFKC').trim().replace(/\s+/g, ' ').slice(0, 100).trimEnd()
    : '';
  if (!query) return { query, results: [] };
  const terms = [...new Set(normalize(query).split(' '))];
  const categories = new Map(settings.map(({ slug, category }) => [slug, category]));
  const ranked = [...withFallback(stored).values()].flatMap((source) => {
    const entry = { ...source, category: categories.get(source.slug) ?? source.category };
    const aliases = bundled.get(entry.slug)?.aliases || '';
    const primary = normalize([entry.title, entry.slug, aliases].join(' '));
    const secondary = normalize([entry.category, entry.summary].join(' '));
    let prose: string;
    const weights = terms.map((term) => {
      if (primary.includes(term)) return 3;
      if (secondary.includes(term)) return 2;
      prose ??= normalize(md.parse(entry.markdown, {}).filter(({ type }) => type === 'inline').map(({ content }) => content).join(' '));
      return prose.includes(term) ? 1 : 0;
    });
    return weights.includes(0) ? [] : [{ link: wikiLink(entry), score: weights.reduce<number>((sum, weight) => sum + weight, 0) }];
  });
  ranked.sort((a, b) => b.score - a.score);
  return { query, results: ranked.map(({ link }) => link) };
}
