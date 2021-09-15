/* eslint-disable no-return-await */
/* eslint-disable camelcase */
import crypto from 'crypto';
import { readFileSync } from 'fs-extra';
import { join } from 'path';
import { ObjectID } from 'mongodb';
import * as bus from 'hydrooj/src/service/bus';
import { Route, Handler } from 'hydrooj/src/service/server';
import * as db from 'hydrooj/src/service/db';
import { PERM } from 'hydrooj/src/model/builtin';
import markdown from './backendlib/markdown';

const {
  system, domain, user, setting, problem, contest,
} = global.Hydro.model;

interface ConstantArgs {
  lang: string;
  domainId: string;
}

declare module 'hydrooj/src/interface' {
  interface Collections {
    cache: {
      _id: string;
      value: any;
    }
  }
}

const cache = {};
const coll = db.collection('cache');
const pages = Object.keys(global.Hydro.ui.manifest)
  .filter((file) => file.endsWith('.page.js'))
  .map((i) => readFileSync(join(global.Hydro.ui.manifest[i], i), 'utf-8'));

async function constant(args: ConstantArgs) {
  // CompileLangs
  const payload = [`window.LANGS=${JSON.stringify(setting.langs)};`];

  // Locale
  let { lang } = args;
  if (!global.Hydro.locales[lang]) lang = system.get('server.language');
  payload[0] += `window.LOCALES=${JSON.stringify(global.Hydro.locales[lang])};`;

  // Extra style
  let [nav_logo_dark, nav_logo_dark_2x] = system.getMany([
    'ui-default.nav_logo_dark', 'ui-default.nav_logo_dark_2x',
  ]);
  const ddoc = await domain.get(args.domainId);
  nav_logo_dark = ddoc.ui?.nav_logo_dark || nav_logo_dark;
  nav_logo_dark_2x = ddoc.ui?.nav_logo_dark_2x || nav_logo_dark_2x;
  payload[0] += `\
    const e = document.createElement('style');
    e.innerHTML = \`\
      ${nav_logo_dark ? `.nav__logo { background-image: url(${nav_logo_dark}) !important }` : ''}
      ${nav_logo_dark_2x ? `\
      @media
        only screen and (-webkit-min-device-pixel-ratio: 1.5), 
        only screen and (min-resolution: 1.5dppx),
        only screen and (min-resolution: 144dpi) {
        .nav__logo, .header--mobile__domain {
          background-image: url(${nav_logo_dark_2x}) !important
        }
    }` : ''}\`;
    document.body.appendChild(e);`;

  payload.push(...pages);

  const c = crypto.createHash('sha1');
  c.update(JSON.stringify(payload));
  const version = c.digest('hex');
  cache[version] = { version, payload };
  await coll.updateOne({ _id: version }, { $set: { value: { version, payload } } }, { upsert: true });
  return version;
}

bus.on('handler/after', async (that) => {
  if (that.response.template) {
    that.UiContext.constantVersion = await constant({
      domainId: that.domainId,
      lang: that.session.viewLang || that.user.viewLang,
    });
  }
});

class WikiHelpHandler extends Handler {
  noCheckPermView = true;

  async get({ domainId }) {
    const LANGS = setting.langs;
    const languages = {};
    // eslint-disable-next-line guard-for-in
    for (const key in LANGS) {
      if (LANGS[key].domain && !LANGS[key].domain.includes(domainId)) continue;
      languages[`${LANGS[key].display}(${key})`] = LANGS[key].compile || LANGS[key].execute;
    }
    this.response.body = { languages };
    this.response.template = 'wiki_help.html';
  }
}

class WikiAboutHandler extends Handler {
  noCheckPermView = true;

  async get() {
    this.response.template = 'about.html';
  }
}

class SetThemeHandler extends Handler {
  noCheckPermView = true

  async get({ theme }) {
    await user.setById(this.user._id, { theme });
    this.back();
  }
}

class MarkdownHandler extends Handler {
  noCheckPermView = true;

  async post({ text, html = false, inline = false }) {
    this.response.body = inline
      ? markdown.renderInline(text, html)
      : markdown.render(text, html);
    this.response.type = 'text/html';
    this.response.status = 200;
  }
}

class UiConstantsHandler extends Handler {
  noCheckPermView = true;

  async get({ version }) {
    this.response.body = cache[version]
      || (await coll.findOne({ _id: version }))?.value;
  }
}

class RichMediaHandler extends Handler {
  async renderUser(domainId, payload) {
    let d = payload.domainId || domainId;
    const cur = payload.domainId ? await user.getById(payload.domainId, this.user._id) : this.user;
    if (!cur.hasPerm(PERM.PERM_VIEW)) d = domainId;
    const udoc = Number.isNaN(+payload.id) ? await user.getByUname(d, payload.id) : await user.getById(d, +payload.id);
    return await this.renderHTML('partials/user.html', { udoc });
  }

  async renderProblem(domainId, payload) {
    const cur = payload.domainId ? await user.getById(payload.domainId, this.user._id) : this.user;
    let pdoc = cur.hasPerm(PERM.PERM_VIEW | PERM.PERM_VIEW_PROBLEM)
      ? await problem.get(payload.domainId || domainId, payload.id) || problem.default
      : problem.default;
    if (pdoc.hidden && !cur.own(pdoc) && !cur.hasPerm(PERM.PERM_VIEW_PROBLEM_HIDDEN)) pdoc = problem.default;
    return await this.renderHTML('partials/problem.html', { pdoc });
  }

  async renderContest(domainId, payload) {
    const cur = payload.domainId ? await user.getById(payload.domainId, this.user._id) : this.user;
    const tdoc = cur.hasPerm(PERM.PERM_VIEW | PERM.PERM_VIEW_CONTEST)
      ? await contest.get(payload.domainId || domainId, new ObjectID(payload.id))
      : null;
    if (tdoc) return await this.renderHTML('partials/contest.html', { tdoc });
    return '';
  }

  async post({ domainId, items }) {
    const res = [];
    for (const item of items) {
      if (item.domainId && item.domainId === domainId) delete item.domainId;
      if (item.type === 'user') res.push(this.renderUser(domainId, item).catch(() => ''));
      else if (item.type === 'problem') res.push(this.renderProblem(domainId, item).catch(() => ''));
      else if (item.type === 'contest') res.push(this.renderContest(domainId, item).catch(() => ''));
      else res.push('');
    }
    this.response.body = await Promise.all(res);
  }
}

global.Hydro.handler.ui = async () => {
  Route('wiki_help', '/wiki/help', WikiHelpHandler);
  Route('wiki_about', '/wiki/about', WikiAboutHandler);
  Route('set_theme', '/set_theme/:id', SetThemeHandler);
  Route('constant', '/constant', UiConstantsHandler);
  Route('markdown', '/markdown', MarkdownHandler);
  Route('media', '/media', RichMediaHandler);
};
