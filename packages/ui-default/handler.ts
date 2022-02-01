/* eslint-disable no-return-await */
/* eslint-disable camelcase */
import crypto from 'crypto';
import { readFileSync } from 'fs-extra';
import { join } from 'path';
import { ObjectID } from 'mongodb';
import * as bus from 'hydrooj/src/service/bus';
import { Route, Handler } from 'hydrooj/src/service/server';
import { PERM } from 'hydrooj/src/model/builtin';
import markdown from './backendlib/markdown';

const {
  system, user, setting, problem, contest,
} = global.Hydro.model;

const pages = Object.keys(global.Hydro.ui.manifest)
  .filter((file) => file.endsWith('.page.js'))
  .map((i) => readFileSync(join(global.Hydro.ui.manifest[i], i), 'utf-8'));

let constant = '';
let hash = '';

function run() {
  const payload = [...pages];
  const [logo, logo2x] = system.getMany([
    'ui-default.nav_logo_dark', 'ui-default.nav_logo_dark_2x',
  ]);
  const res = [];
  res.push(`window.LANGS=${JSON.stringify(setting.langs)};`);
  if (logo) res.push(`UiContext.nav_logo_dark="${logo}";`);
  if (logo2x) res.push(`UiContext.nav_logo_dark_2x="${logo2x}";`);
  payload.unshift(res.join('\n'));

  const c = crypto.createHash('sha1');
  c.update(JSON.stringify(payload));
  const version = c.digest('hex');
  constant = JSON.stringify(payload);
  hash = version;
}
const versionHandler = (that) => {
  that.UiContext.constantVersion = hash;
};
bus.on('handler/after', versionHandler);
bus.on('handler/error', versionHandler);
bus.on('app/started', run);
bus.on('system/setting', run);

class WikiHelpHandler extends Handler {
  noCheckPermView = true;

  async get({ domainId }) {
    const LANGS = setting.langs;
    const languages = {};
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
    let raw = system.get('ui-default.about') || '';
    // TODO template engine
    raw = raw.replace(/{{ name }}/g, this.domain.ui?.name || system.get('server.name')).trim();
    const lines = raw.split('\n');
    const sections = [];
    for (const line of lines) {
      if (line.startsWith('# ')) {
        const id = line.split(' ')[1];
        sections.push({
          id,
          title: line.split(id)[1].trim(),
          content: '',
        });
      } else sections[sections.length - 1].content += `${line}\n`;
    }
    this.response.template = 'about.html';
    this.response.body = { sections };
  }
}

class SetThemeHandler extends Handler {
  noCheckPermView = true;

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

class ResourceHandler extends Handler {
  noCheckPermView = true;

  async prepare() {
    this.response.addHeader('Cache-Control', 'public, max-age=86400');
  }
}

class UiConstantsHandler extends ResourceHandler {
  async all() {
    this.response.addHeader('ETag', hash);
    this.response.body = constant;
    this.response.type = 'application/json';
  }
}

class LanguageHandler extends ResourceHandler {
  async all({ lang }) {
    if (!global.Hydro.locales[lang]) lang = system.get('server.language');
    this.response.body = `window.LOCALES=${JSON.stringify(global.Hydro.locales[lang])};`;
    this.response.type = 'application/javascript';
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
  Route('lang', '/l/:lang', LanguageHandler);
  Route('media', '/media', RichMediaHandler);
};
