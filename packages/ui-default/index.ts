/* eslint-disable no-return-await */
/* eslint-disable camelcase */
import crypto from 'crypto';
import esbuild from 'esbuild';
import {
  ContestModel, Context, fs, Handler, Logger, ObjectID, PERM, PRIV, ProblemModel, Schema,
  SettingModel, SystemModel, SystemSettings, UiContextBase, UserModel,
} from 'hydrooj';
import { debounce } from 'lodash';
import { tmpdir } from 'os';
import { join, resolve } from 'path';
import convert from 'schemastery-jsonschema';
import markdown from './backendlib/markdown';

declare module 'hydrooj' {
  interface UI {
    esbuildPlugins?: esbuild.Plugin[]
  }
  interface SystemKeys {
    'ui-default.nav_logo_dark': string;
  }
  interface UiContextBase {
    nav_logo_dark?: string;
    constantVersion?: string;
  }
}

let constant = '';
let hash = '';
const logger = new Logger('ui');

export async function buildUI() {
  const start = Date.now();
  const entryPoints: string[] = [];
  for (const addon of global.addons) {
    const publicPath = resolve(addon, 'public');
    if (fs.existsSync(publicPath)) {
      const targets = fs.readdirSync(publicPath);
      for (const target of targets) {
        if (/\.page\.[jt]sx?$/.test(target)) entryPoints.push(join(publicPath, target));
      }
    }
  }
  const build = await esbuild.build({
    format: 'iife',
    entryPoints,
    bundle: true,
    outdir: tmpdir(),
    splitting: false,
    write: false,
    target: [
      'chrome60',
    ],
    plugins: [
      ...(global.Hydro.ui.esbuildPlugins || []),
      {
        name: 'federation',
        setup(b) {
          b.onResolve({ filter: /^@hydrooj\/ui-default/ }, () => ({
            path: 'api',
            namespace: 'ui-default',
          }));
          b.onLoad({ filter: /.*/, namespace: 'ui-default' }, () => ({
            contents: 'module.exports = window.HydroExports;',
            loader: 'tsx',
          }));
        },
      },
    ],
    minify: !process.env.DEV,
  });
  if (build.errors.length) console.error(build.errors);
  if (build.warnings.length) console.warn(build.warnings);
  const pages = build.outputFiles.map((i) => i.text);
  const payload = [`window.LANGS=${JSON.stringify(SettingModel.langs)};`, ...pages];

  const c = crypto.createHash('sha1');
  c.update(JSON.stringify(payload));
  const version = c.digest('hex');
  constant = JSON.stringify(payload);
  UiContextBase.constantVersion = hash = version;
  logger.success('UI addons built in %d ms', Date.now() - start);
}
function updateLogo() {
  UiContextBase.nav_logo_dark = SystemModel.get('ui-default.nav_logo_dark');
}

class WikiHelpHandler extends Handler {
  noCheckPermView = true;

  async get({ domainId }) {
    const LANGS = SettingModel.langs;
    const languages = {};
    for (const key in LANGS) {
      if (LANGS[key].domain && !LANGS[key].domain.includes(domainId)) continue;
      if (LANGS[key].hidden) continue;
      languages[`${LANGS[key].display}(${key})`] = LANGS[key].compile || LANGS[key].execute;
    }
    this.response.body = { languages };
    this.response.template = 'wiki_help.html';
  }
}

class WikiAboutHandler extends Handler {
  noCheckPermView = true;

  async get() {
    let raw = SystemModel.get('ui-default.about') || '';
    // TODO template engine
    raw = raw.replace(/{{ name }}/g, this.domain.ui?.name || SystemModel.get('server.name')).trim();
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
    this.checkPriv(PRIV.PRIV_USER_PROFILE);
    await UserModel.setById(this.user._id, { theme });
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
    if (!global.Hydro.locales[lang]) lang = SystemModel.get('server.language');
    this.response.body = `window.LOCALES=${JSON.stringify(global.Hydro.locales[lang][Symbol.for('iterate')])};`;
    this.response.type = 'application/javascript';
  }
}

class SWConfigHandler extends ResourceHandler {
  async get() {
    this.response.body = {
      preload: SystemModel.get('ui-default.preload'),
      hosts: [
        `http://${this.request.host}`,
        `https://${this.request.host}`,
        SystemModel.get('server.url'),
        SystemModel.get('server.cdn'),
      ],
    };
  }
}

class SystemConfigSchemaHandler extends Handler {
  async get() {
    const schema = convert(Schema.intersect(SystemSettings) as any, true);
    this.response.body = schema;
  }
}

class RichMediaHandler extends Handler {
  async renderUser(domainId, payload) {
    let d = payload.domainId || domainId;
    const cur = payload.domainId ? await UserModel.getById(payload.domainId, this.user._id) : this.user;
    if (!cur.hasPerm(PERM.PERM_VIEW)) d = domainId;
    const udoc = Number.isNaN(+payload.id) ? await UserModel.getByUname(d, payload.id) : await UserModel.getById(d, +payload.id);
    return await this.renderHTML('partials/user.html', { udoc });
  }

  async renderProblem(domainId, payload) {
    const cur = payload.domainId ? await UserModel.getById(payload.domainId, this.user._id) : this.user;
    let pdoc = cur.hasPerm(PERM.PERM_VIEW | PERM.PERM_VIEW_PROBLEM)
      ? await ProblemModel.get(payload.domainId || domainId, payload.id) || ProblemModel.default
      : ProblemModel.default;
    if (pdoc.hidden && !cur.own(pdoc) && !cur.hasPerm(PERM.PERM_VIEW_PROBLEM_HIDDEN)) pdoc = ProblemModel.default;
    return await this.renderHTML('partials/problem.html', { pdoc });
  }

  async renderContest(domainId, payload) {
    const cur = payload.domainId ? await UserModel.getById(payload.domainId, this.user._id) : this.user;
    const tdoc = cur.hasPerm(PERM.PERM_VIEW | PERM.PERM_VIEW_CONTEST)
      ? await ContestModel.get(payload.domainId || domainId, new ObjectID(payload.id))
      : null;
    if (tdoc) return await this.renderHTML('partials/contest.html', { tdoc });
    return '';
  }

  async renderHomework(domainId, payload) {
    const cur = payload.domainId ? await UserModel.getById(payload.domainId, this.user._id) : this.user;
    const tdoc = cur.hasPerm(PERM.PERM_VIEW | PERM.PERM_VIEW_HOMEWORK)
      ? await ContestModel.get(payload.domainId || domainId, new ObjectID(payload.id))
      : null;
    if (tdoc) return await this.renderHTML('partials/homework.html', { tdoc });
    return '';
  }

  async post({ domainId, items }) {
    const res = [];
    for (const item of items) {
      if (item.domainId && item.domainId === domainId) delete item.domainId;
      if (item.type === 'user') res.push(this.renderUser(domainId, item).catch(() => ''));
      else if (item.type === 'problem') res.push(this.renderProblem(domainId, item).catch(() => ''));
      else if (item.type === 'contest') res.push(this.renderContest(domainId, item).catch(() => ''));
      else if (item.type === 'homework') res.push(this.renderHomework(domainId, item).catch(() => ''));
      else res.push('');
    }
    this.response.body = await Promise.all(res);
  }
}

export function apply(ctx: Context) {
  if (process.env.HYDRO_CLI) return;
  ctx.Route('wiki_help', '/wiki/help', WikiHelpHandler);
  ctx.Route('wiki_about', '/wiki/about', WikiAboutHandler);
  ctx.Route('set_theme', '/set_theme/:theme', SetThemeHandler);
  ctx.Route('constant', '/constant/:version', UiConstantsHandler);
  ctx.Route('markdown', '/markdown', MarkdownHandler);
  ctx.Route('config_schema', '/manage/config/schema.json', SystemConfigSchemaHandler, PRIV.PRIV_EDIT_SYSTEM);
  ctx.Route('lang', '/l/:lang', LanguageHandler);
  ctx.Route('sw_config', '/sw-config', SWConfigHandler);
  ctx.Route('media', '/media', RichMediaHandler);
  ctx.on('app/started', buildUI);
  ctx.on('app/started', updateLogo);
  const debouncedBuildUI = debounce(buildUI, 1000);
  const triggerHotUpdate = (path?: string) => {
    if (path && !path.includes('/ui-default/') && !path.includes('/public/')) return;
    debouncedBuildUI();
    updateLogo();
  };
  ctx.on('system/setting', () => triggerHotUpdate());
  ctx.on('app/watch/change', triggerHotUpdate);
  ctx.on('app/watch/unlink', triggerHotUpdate);
  ctx.on('handler/after/DiscussionRaw', async (that) => {
    if (that.args.render && that.response.type === 'text/markdown') {
      that.response.type = 'text/html';
      that.response.body = await markdown.render(that.response.body);
    }
  });
}
