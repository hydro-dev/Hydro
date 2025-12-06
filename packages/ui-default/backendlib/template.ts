import path from 'path';
import * as status from '@hydrooj/common/status';
import { findFileSync, getAlphabeticId } from '@hydrooj/utils/lib/utils';
import {
  avatar, Context, difficultyAlgorithm, fs, PERM, PRIV, Service, STATUS, yaml,
} from 'hydrooj';
import { convert } from 'html-to-text';
import jsesc from 'jsesc';
import nunjucks from 'nunjucks';
import markdown from './markdown';
import { ensureTag, xss } from './markdown-it-xss';
import * as misc from './misc';
const argv = require('cac')().parse();

let { template } = argv.options;
if (!template || typeof template !== 'string') template = findFileSync('@hydrooj/ui-default/templates');
else template = findFileSync(template);

const replacer = (k, v) => {
  if (k.startsWith('_') && k !== '_id') return undefined;
  if (typeof v === 'bigint') return `BigInt::${v.toString()}`;
  return v;
};

async function getFiles(folder: string, base = ''): Promise<string[]> {
  const files: string[] = [];
  const f = await fs.readdir(folder);
  for (const i of f) {
    if ((await fs.stat(path.join(folder, i))).isDirectory()) {
      files.push(...await getFiles(path.join(folder, i), path.join(base, i)));
    } else files.push(path.join(base, i));
  }
  return files.map((item) => item.replace(/\\/g, '/'));
}

function locateFile(basePath: string, filenames: string[]) {
  for (const i of filenames) {
    const p = path.resolve(basePath, i);
    if (fs.existsSync(p)) return p;
  }
  return null;
}

// @ts-ignore
nunjucks.runtime.memberLookup = function memberLookup(obj, val) {
  if ((obj || {})._original) obj = obj._original;
  if (obj === undefined || obj === null) return undefined;
  if (typeof obj[val] === 'function') {
    const fn = function (...args) {
      return obj[val].call(obj, ...args); // eslint-disable-line no-useless-call
    };
    fn._original = obj[val];
    return fn;
  }
  return obj[val];
};

class Nunjucks extends nunjucks.Environment {
  constructor(Loader: any) {
    super(new Loader(), { autoescape: true, trimBlocks: true });
    this.addFilter('await', async (promise, callback) => {
      try {
        const result = await promise;
        callback(null, result);
      } catch (error) {
        callback(error);
      }
    }, true);
    this.addFilter('json', (self) => (self ? JSON.stringify(self, replacer) : ''));
    this.addFilter('parseYaml', (self) => yaml.load(self));
    this.addFilter('dumpYaml', (self) => yaml.dump(self));
    this.addFilter('assign', (self, data) => Object.assign(self, data));
    this.addFilter('markdown', (self) => ensureTag(markdown.render(self)));
    this.addFilter('markdownInline', (self) => ensureTag(markdown.renderInline(self)));
    this.addFilter('ansi', (self) => misc.ansiToHtml(self));
    this.addFilter('base64_encode', (s) => Buffer.from(s).toString('base64'));
    this.addFilter('base64_decode', (s) => Buffer.from(s, 'base64').toString());
    this.addFilter('jsesc', (self) => jsesc(self, { isScriptContext: true }));
    this.addFilter('bitand', (self, val) => self & val);
    this.addFilter('toString', (self) => (typeof self === 'string' ? self : JSON.stringify(self, replacer)));
    this.addFilter('content', (content, language, html) => {
      let s: any = '';
      try {
        s = JSON.parse(content);
      } catch {
        s = content;
      }
      if (typeof s === 'object') {
        const langs = Object.keys(s);
        const f = langs.filter((i) => i.startsWith(language));
        if (s[language]) s = s[language];
        else if (f.length) s = s[f[0]];
        else s = s[langs[0]];
      }
      return ensureTag(html ? xss.process(s) : markdown.render(s));
    });
    this.addFilter('problemPreview', (html) => {
      const res = convert(html, {
        selectors: [
          { selector: 'math', format: 'skip' },
        ],
      });
      return res.split('\n').map((i) => i.trim()).join('\n').replace(/\n+/g, '\n');
    });
    this.addFilter('contentLang', (content) => {
      let s: any = '';
      try {
        s = JSON.parse(content);
      } catch {
        s = content;
      }
      if (typeof s === 'object') return Object.keys(s);
      return [];
    });
    this.addFilter('log', (self) => {
      console.log(self);
      return self;
    });

    // eslint-disable-next-line no-eval
    this.addGlobal('eval', eval);
    this.addGlobal('Date', Date);
    this.addGlobal('Object', Object);
    this.addGlobal('String', String);
    this.addGlobal('Array', Array);
    this.addGlobal('Math', Math);
    this.addGlobal('process', process);
    this.addGlobal('global', global);
    this.addGlobal('typeof', (o) => typeof o);
    this.addGlobal('instanceof', (a, b) => a instanceof b);
    this.addGlobal('paginate', misc.paginate);
    this.addGlobal('size', misc.size);
    this.addGlobal('utils', { status, getAlphabeticId, buildQueryString: misc.buildQueryString });
    this.addGlobal('avatarUrl', avatar);
    this.addGlobal('formatSeconds', misc.formatSeconds);
    this.addGlobal('model', global.Hydro.model);
    this.addGlobal('lib', { difficulty: difficultyAlgorithm });
    this.addGlobal('ui', global.Hydro.ui);
    this.addGlobal('isIE', (str) => {
      if (!str) return false;
      if (['MSIE', 'rv:11.0'].some((i) => str.includes(i))) return true;
      if (str.includes('Chrome/') && +str.split('Chrome/')[1].split('.')[0] < 60) return true;
      return false;
    });
    this.addGlobal('set', (obj, key, val) => {
      if (val !== undefined) obj[key] = val;
      else Object.assign(obj, key);
      return '';
    });

    const platformIconMap = { 'mac os': 'mac' };
    const supportedPlatformIcons = ['android', 'chromeos', 'ios', 'linux', 'mac', 'mobile', 'windows'];
    this.addGlobal('platformIcon', (platform) => {
      const key = platformIconMap[platform?.toLowerCase()] || platform?.toLowerCase();
      if (supportedPlatformIcons.includes(key)) return key;
      return 'unknown';
    });
  }
}

export class TemplateService extends Service {
  static inject = ['server'];

  registry: Record<string, string> = {};

  constructor(public ctx: Context) {
    super(ctx, 'template');
    const that = this;
    ctx.on('handler/create', async (h) => {
      h.user = h.context.HydroContext.user as any;
      h.domain = h.context.HydroContext.domain as any;
      h.translate = h.translate.bind(h);
      h.url = h.url.bind(h);
      h.ctx = h.ctx.extend({ domain: h.domain });
      h.renderHTML = ((orig) => function (name: string, args: Record<string, any>) {
        const s = name.split('.');
        let templateName = `${s[0]}.${args.domainId}.${s[1]}`;
        if (!that.registry[templateName]) templateName = name;
        return orig(templateName, args);
      })(h.renderHTML).bind(h);
    });

    class Loader extends nunjucks.Loader {
      getSource(name) {
        const src = that.registry[name];
        const ref = that.registry[`${name}.source`];
        if (!process.env.DEV) {
          if (!src) throw new Error(`Cannot get template ${name}`);
          return {
            src,
            path: name,
            noCache: false,
          };
        }
        let fullpath: string | null = null;
        const p = path.resolve(template, name);
        if (fs.existsSync(p)) fullpath = p;
        if (!fullpath && ref && fs.existsSync(ref)) fullpath = ref;
        if (!fullpath) {
          if (src) {
            return {
              src,
              path: name,
              noCache: true,
            };
          }
          throw new Error(`Cannot get template ${name}`);
        }
        return {
          src: fs.readFileSync(fullpath, 'utf-8'),
          path: fullpath,
          noCache: true,
        };
      }
    }

    const env = new Nunjucks(Loader);
    env.addGlobal('findSubModule', (prefix) => Object.keys(that.registry).filter((n) => n.startsWith(prefix)));
    env.addGlobal('templateExists', (name) => !!that.registry[name]);

    const render = (name: string, state: any) => new Promise<string>((resolve, reject) => {
      const start = Date.now();
      env.render(name, {
        page_name: name.split('.')[0],
        ...state,
        formatJudgeTexts: (texts) => texts.map((text) => {
          if (typeof text === 'string') return text;
          return state._(text.message).format(...text.params || []) + ((process.env.DEV && text.stack) ? `\n${text.stack}` : '');
        }).join('\n'),
        datetimeSpan: (arg0, arg1, arg2) => misc.datetimeSpan(arg0, arg1, arg2, state.handler.user?.timeZone),
        ctx: state.handler?.ctx,
        perm: PERM,
        PRIV,
        STATUS,
        UiContext: state.handler?.UiContext || {},
      }, (err, res) => {
        const end = Date.now();
        if (end - start > 5000) console.error(`Render of ${name} took ${end - start}ms`);
        if (err) reject(err);
        else resolve(res || '');
      });
    });

    ctx.server.registerRenderer('ui-default', {
      name: 'ui-default',
      output: 'html',
      accept: [],
      asFallback: true,
      priority: 1,
      render: (name, args, context) => render(name, { ...context, ...args }),
    });
  }

  async [Context.init]() {
    const pending = Object.values(global.addons);
    const logger = this.ctx.logger('template');
    for (const i of pending) {
      const p = locateFile(i as string, ['template', 'templates']);
      if (p && (await fs.stat(p)).isDirectory()) {
        try {
          const files = await getFiles(p);
          for (const file of files) {
            const l = path.resolve(p, file);
            this.registry[file] = await fs.readFile(l, 'utf-8');
            if (process.env.DEV) this.registry[`${file}.source`] = l;
          }
          logger.info('Template init: %s', i);
        } catch (e) {
          this.ctx.injectUI('Notification', 'Template load fail: {0}', { args: [i], type: 'warn' }, PRIV.PRIV_VIEW_SYSTEM_NOTIFICATION);
          logger.error('Template Load Fail: %s', i);
          logger.error(e);
        }
      }
    }
  }
}
