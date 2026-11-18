import type { Context } from 'hydrooj';
import { CreateError, NotFoundError, UserFacingError, ValidationError } from 'hydrooj';
import { getBundledWikiSource, getWikiDirectory, WikiDirectoryEntry, WikiLink, WikiSource } from './catalog';

export const wikiLimits = {
  slug: 64, title: 100, category: 50, summary: 240, markdown: 64 * 1024, order: 999999,
};

const reservedSlugs = new Set(['about', 'help', 'new', 'directory']);
// eslint-disable-next-line unicorn/throw-new-error
const WikiSlugExistsError = CreateError('WikiSlugExistsError', UserFacingError, 'A Wiki article with this address already exists.', 409);

interface WikiDocument extends WikiSource {
  _id: string;
  domainId: string;
  updatedAt: Date;
  updatedBy: number;
}

interface WikiDirectoryDocument {
  _id: string;
  entries: WikiDirectoryEntry[];
}

declare module 'hydrooj' {
  interface Collections {
    'wiki.article': WikiDocument;
    'wiki.directory': WikiDirectoryDocument;
  }
}

export function isWikiSlug(slug: unknown): slug is string {
  return typeof slug === 'string' && slug.length <= wikiLimits.slug
    && /^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(slug) && !reservedSlugs.has(slug);
}

export function requireWikiSlug(slug: unknown) {
  if (!isWikiSlug(slug)) throw new ValidationError('slug');
  return slug;
}

function wikiLabel(name: 'title' | 'category' | 'summary', raw: unknown) {
  const value = typeof raw === 'string' ? raw.trim() : '';
  if (!value || value.length > wikiLimits[name] || /[\p{Cc}\p{Zl}\p{Zp}]/u.test(value)) throw new ValidationError(name);
  return value;
}

export function parseWikiFields(body: Record<string, unknown> | undefined) {
  const markdown = body?.markdown;
  if (typeof markdown !== 'string' || markdown.length > wikiLimits.markdown
    || Buffer.byteLength(markdown, 'utf8') > wikiLimits.markdown || !markdown.trim() || markdown.includes('\0')) {
    throw new ValidationError('Markdown');
  }
  return {
    title: wikiLabel('title', body?.title),
    category: wikiLabel('category', body?.category),
    summary: wikiLabel('summary', body?.summary),
    markdown: markdown.replace(/\r\n?/g, '\n'),
  };
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return !!value && typeof value === 'object' && !Array.isArray(value);
}

function parseWikiDirectory(input: unknown, articles: readonly WikiLink[]): WikiDirectoryEntry[] {
  if (!isRecord(input) || !articles.length || Object.keys(input).length !== articles.length) {
    throw new ValidationError('entries');
  }
  // Prefix keys so the URL-encoded parser handles numeric slugs and names such as "constructor" as object keys.
  return articles.map(({ slug }) => {
    const key = `slug-${slug}`;
    const row = Object.hasOwn(input, key) ? input[key] : null;
    if (!isWikiSlug(slug) || !isRecord(row) || Object.keys(row).length !== 2
      || !Object.hasOwn(row, 'category') || !Object.hasOwn(row, 'order')) throw new ValidationError('entries');
    const { order } = row;
    if (typeof order !== 'string' || (order !== '' && !/^[0-9]{1,6}$/.test(order))) {
      throw new ValidationError('order');
    }
    return { slug, category: wikiLabel('category', row.category), order: order === '' ? null : Number(order) };
  });
}

export class WikiStore {
  constructor(private readonly db: Context['db'], private readonly domainId: string) { }

  private get collection() {
    return this.db.collection('wiki.article');
  }

  private get directoryCollection() {
    return this.db.collection('wiki.directory');
  }

  private id(slug: string) {
    return `${this.domainId}/${slug}`;
  }

  async list(): Promise<WikiLink[]> {
    return await this.collection.find<WikiLink>(
      { domainId: this.domainId },
      { projection: { _id: 0, slug: 1, title: 1, category: 1, summary: 1 }, sort: { slug: 1 } },
    ).toArray();
  }

  async getDirectorySettings() {
    const config = await this.directoryCollection.findOne({ _id: this.domainId });
    return config?.entries ?? [];
  }

  async saveDirectory(input: unknown) {
    const entries = parseWikiDirectory(input, getWikiDirectory(await this.list()));
    await this.directoryCollection.updateOne({ _id: this.domainId }, { $set: { entries } }, { upsert: true });
  }

  async searchSources(): Promise<WikiSource[]> {
    return await this.collection.find<WikiSource>(
      { domainId: this.domainId },
      { projection: { _id: 0, slug: 1, title: 1, category: 1, summary: 1, markdown: 1 }, sort: { slug: 1 } },
    ).toArray();
  }

  async get(slug: unknown): Promise<WikiSource> {
    if (!isWikiSlug(slug)) throw new NotFoundError();
    const stored = await this.collection.findOne<WikiSource>(
      { _id: this.id(slug) },
      { projection: { _id: 0, slug: 1, title: 1, category: 1, summary: 1, markdown: 1 } },
    );
    const source = stored ?? getBundledWikiSource(slug);
    if (!source) throw new NotFoundError();
    const {
      title, category, summary, markdown,
    } = source;
    return { slug, title, category, summary, markdown };
  }

  async create(article: WikiSource, uid: number) {
    if (getBundledWikiSource(article.slug)) throw new WikiSlugExistsError();
    try {
      await this.collection.insertOne({
        ...article, _id: this.id(article.slug), domainId: this.domainId, updatedAt: new Date(), updatedBy: uid,
      });
    } catch (err) {
      if (err.code === 11000) throw new WikiSlugExistsError();
      throw err;
    }
  }

  async edit({ slug, ...fields }: WikiSource, uid: number) {
    const result = await this.collection.updateOne(
      { _id: this.id(slug) },
      {
        $set: { ...fields, updatedAt: new Date(), updatedBy: uid },
        $setOnInsert: { slug, domainId: this.domainId },
      },
      { upsert: !!getBundledWikiSource(slug) },
    );
    if (!result.matchedCount && !result.upsertedCount) throw new NotFoundError();
    await this.directoryCollection.updateOne(
      { _id: this.domainId, 'entries.slug': slug },
      { $set: { 'entries.$.category': fields.category } },
    );
  }
}

export function registerWikiStorage(ctx: Context) {
  ctx.inject(['db'], async (c) => {
    const collection = c.db.collection('wiki.article');
    c.on('domain/delete', (domainId) => Promise.all([
      collection.deleteMany({ domainId }),
      c.db.collection('wiki.directory').deleteOne({ _id: domainId }),
    ]));
    await collection.createIndex({ domainId: 1, slug: 1 });
  });
}
