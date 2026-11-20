import {
  Context, CsrfTokenError, Handler, NotFoundError, PERM, PRIV, PrivilegeError,
} from 'hydrooj';
import {
  getAdjacentWikiArticles, getWikiCategories, getWikiDirectory, renderWikiArticle, searchWiki,
  splitWikiAliases, WikiSource,
} from './catalog';
import {
  isWikiSlug, parseWikiFields, registerWikiStorage, requireWikiSlug, wikiLimits, WikiStore,
} from './store';

class WikiHandler extends Handler {
  protected getWikiDomainId() {
    // Hydro resolves the user's domain role using args.domainId, which can include query/body fields.
    const domainId = this.domain._id;
    if (this.args.domainId !== domainId) throw new NotFoundError();
    return domainId;
  }

  protected get wikiStore() {
    return new WikiStore(this.ctx.db, this.getWikiDomainId());
  }

  protected get canEditWiki() {
    return this.user._id > 0 && this.user.hasPriv(PRIV.PRIV_USER_PROFILE) && this.user.hasPerm(PERM.PERM_EDIT_WIKI);
  }
}

export class WikiIndexHandler extends WikiHandler {
  async get() {
    const store = this.wikiStore;
    const input = this.context.query.q;
    const searching = typeof input === 'string' && input.trim();
    const [articles, settings] = await Promise.all([
      searching ? store.searchSources() : store.list(),
      store.getDirectorySettings(),
    ]);
    this.response.template = 'wiki_main.html';
    this.response.body = {
      page_name: 'Wiki',
      categories: getWikiCategories(articles, settings),
      canEditWiki: this.canEditWiki,
      splitWikiAliases,
      ...searchWiki(input, searching ? articles as WikiSource[] : [], settings),
    };
  }
}

export class WikiArticleHandler extends WikiHandler {
  async get() {
    const store = this.wikiStore;
    const [{ source, updatedAt }, articles, settings] = await Promise.all([
      store.getWithMeta(this.context.params.slug), store.list(), store.getDirectorySettings(),
    ]);
    const categories = getWikiCategories(articles, settings);
    const article = renderWikiArticle({ ...source, category: settings.find(({ slug }) => slug === source.slug)?.category ?? source.category });
    const { prevArticle, nextArticle } = getAdjacentWikiArticles(categories, source.slug);
    this.UiContext.extraTitleContent = article.title;
    this.response.template = 'wiki_main.html';
    this.response.body = {
      page_name: 'Wiki',
      categories,
      article,
      prevArticle,
      nextArticle,
      updatedAtLabel: updatedAt ? updatedAt.toISOString().slice(0, 10) : '',
      splitWikiAliases,
      canEditWiki: this.canEditWiki,
    };
  }
}

class WikiEditorHandler extends WikiHandler {
  protected checkEditor() {
    if (!(this.user._id > 0)) throw new PrivilegeError(PRIV.PRIV_USER_PROFILE);
    this.checkPriv(PRIV.PRIV_USER_PROFILE);
    this.checkPerm(PERM.PERM_EDIT_WIKI);
  }

  protected checkEditorPost(requireSameOrigin = false) {
    this.checkEditor();
    const { origin, referer } = this.request.headers;
    if (!origin && !requireSameOrigin) return;
    try {
      const expected = new URL(`${this.context.protocol}://${this.request.host}`).origin;
      if (origin ? origin === expected : referer && new URL(referer).origin === expected) return;
    } catch {
      // Reject malformed origins or referrers as well.
    }
    throw new CsrfTokenError();
  }

  protected showEditor(article?: WikiSource) {
    this.response.template = 'wiki_edit.html';
    this.response.body = {
      page_name: 'Wiki', article, limits: wikiLimits,
    };
  }

  protected redirectToArticle(slug: string) {
    this.response.redirect = this.url('wiki_article', { domainId: this.getWikiDomainId(), slug });
  }
}

export class WikiCreateHandler extends WikiEditorHandler {
  async get() {
    this.checkEditor();
    // Validate the routed domain even though this form has no article to load.
    this.getWikiDomainId();
    this.showEditor();
  }

  async post() {
    this.checkEditorPost();
    const store = this.wikiStore;
    const slug = requireWikiSlug(this.request.body?.slug);
    await store.create({ slug, ...parseWikiFields(this.request.body) }, this.user._id);
    this.redirectToArticle(slug);
  }
}

export class WikiEditHandler extends WikiEditorHandler {
  async get() {
    this.checkEditor();
    const store = this.wikiStore;
    const [article, settings] = await Promise.all([store.get(this.context.params.slug), store.getDirectorySettings()]);
    this.showEditor({ ...article, category: settings.find(({ slug }) => slug === article.slug)?.category ?? article.category });
  }

  async post() {
    this.checkEditorPost();
    const store = this.wikiStore;
    // Resolve the slug from the path; submitted fields cannot rename the article.
    const slug = this.context.params.slug;
    if (!isWikiSlug(slug)) throw new NotFoundError();
    await store.edit({ slug, ...parseWikiFields(this.request.body) }, this.user._id);
    this.redirectToArticle(slug);
  }
}

export class WikiDeleteHandler extends WikiEditorHandler {
  async post() {
    this.checkEditorPost(true);
    const slug = this.context.params.slug;
    if (!isWikiSlug(slug)) throw new NotFoundError();
    await this.wikiStore.delete(slug);
    this.response.redirect = this.url('wiki_main', { domainId: this.getWikiDomainId() });
  }
}

export class WikiDirectoryHandler extends WikiEditorHandler {
  async get() {
    this.checkEditor();
    const store = this.wikiStore;
    const [articles, settings] = await Promise.all([store.list(), store.getDirectorySettings()]);
    this.UiContext.extraTitleContent = '管理目录';
    this.response.template = 'wiki_main.html';
    this.response.body = {
      page_name: 'Wiki',
      categories: getWikiCategories(articles, settings),
      directory: getWikiDirectory(articles, settings),
      canEditWiki: this.canEditWiki,
      limits: wikiLimits,
    };
  }

  async post() {
    this.checkEditorPost(true);
    await this.wikiStore.saveDirectory(this.request.body?.entries);
    this.response.redirect = this.url('wiki_directory', { domainId: this.getWikiDomainId() });
  }
}

export function registerWikiRoutes(ctx: Context) {
  registerWikiStorage(ctx);
  ctx.Route('wiki_main', '/wiki', WikiIndexHandler);
  ctx.Route('wiki_create', '/wiki/new', WikiCreateHandler);
  ctx.Route('wiki_directory', '/wiki/directory', WikiDirectoryHandler);
  ctx.Route('wiki_edit', '/wiki/:slug/edit', WikiEditHandler);
  ctx.Route('wiki_delete', '/wiki/:slug/delete', WikiDeleteHandler);
  ctx.Route('wiki_article', '/wiki/:slug', WikiArticleHandler);
}
