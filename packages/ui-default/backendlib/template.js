const fs = require('fs');
const path = require('path');
const yaml = require('js-yaml');
const serialize = require('serialize-javascript');
const nunjucks = require('nunjucks');
const { filter } = require('lodash');
const jsesc = require('jsesc');
const argv = require('cac')().parse();
const { findFileSync } = require('@hydrooj/utils/lib/utils');
const status = require('@hydrooj/utils/lib/status');
const markdown = require('./markdown');

const { misc, buildContent, avatar } = global.Hydro.lib;

let { template } = argv.options;
if (template && typeof template !== 'string') template = findFileSync('@hydrooj/ui-default/templates');
else if (template) template = findFileSync(template);

class Loader extends nunjucks.Loader {
  // eslint-disable-next-line class-methods-use-this
  getSource(name) {
    if (!template) {
      if (!global.Hydro.ui.template[name]) throw new Error(`Cannot get template ${name}`);
      return {
        src: global.Hydro.ui.template[name],
        path: name,
        noCache: false,
      };
    }
    let fullpath = null;
    const p = path.resolve(template, name);
    if (fs.existsSync(p)) fullpath = p;
    if (!fullpath) {
      if (global.Hydro.ui.template[name]) {
        return {
          src: global.Hydro.ui.template[name],
          path: name,
          noCache: true,
        };
      }
      throw new Error(`Cannot get template ${name}`);
    }
    return {
      src: fs.readFileSync(fullpath, 'utf-8').toString(),
      path: fullpath,
      noCache: true,
    };
  }
}

const replacer = (k, v) => {
  if (k.startsWith('_') && k !== '_id') return undefined;
  if (typeof v === 'bigint') return `BigInt::${v.toString()}`;
  return v;
};

class Nunjucks extends nunjucks.Environment {
  constructor() {
    super(new Loader(), { autoescape: true, trimBlocks: true });
    this.addFilter('json', (self) => (self ? JSON.stringify(self, replacer) : ''));
    this.addFilter('parseYaml', (self) => yaml.load(self));
    this.addFilter('dumpYaml', (self) => yaml.dump(self));
    this.addFilter('serialize', (self, ignoreFunction = true) => serialize(self, { ignoreFunction }));
    this.addFilter('assign', (self, data) => Object.assign(self, data));
    this.addFilter('markdown', (self, html = false) => markdown.render(self, html));
    this.addFilter('markdownInline', (self, html = false) => markdown.renderInline(self, html));
    this.addFilter('ansi', (self) => misc.ansiToHtml(self));
    this.addFilter('base64_encode', (s) => Buffer.from(s).toString('base64'));
    this.addFilter('base64_decode', (s) => Buffer.from(s, 'base64').toString());
    this.addFilter('jsesc', (self) => jsesc(self, { isScriptContext: true }));
    this.addFilter('bitand', (self, val) => self & val);
    this.addFilter('replaceBr', (self) => self.toString().replace(/\n/g, '<br>'));
    this.addFilter('toString', (self) => (typeof self === 'string' ? self : JSON.stringify(self, replacer)));
    this.addFilter('content', (content, language, html) => {
      let s = '';
      try {
        s = JSON.parse(content);
      } catch {
        s = content;
      }
      if (typeof s === 'object' && !(s instanceof Array)) {
        const langs = Object.keys(s);
        const f = langs.filter((i) => i.startsWith(language));
        if (s[language]) s = s[language];
        else if (f.length) s = s[f[0]];
        else s = s[langs[0]];
      }
      if (s instanceof Array) s = buildContent(s, html ? 'html' : 'markdown', (str) => str.translate(language));
      return markdown.render(s);
    });
    this.addFilter('log', (self) => {
      console.log(self);
      return self;
    });
  }
}
nunjucks.runtime.memberLookup = function memberLookup(obj, val) {
  if ((obj || {})._original) obj = obj._original;
  if (obj === undefined || obj === null) return undefined;
  if (typeof obj[val] === 'function') {
    const fn = function () {
      // eslint-disable-next-line
      for (var _len2 = arguments.length, args = new Array(_len2), _key2 = 0; _key2 < _len2; _key2++) {
        // eslint-disable-next-line prefer-rest-params
        args[_key2] = arguments[_key2];
      }
      // eslint-disable-next-line block-scoped-var
      return obj[val].call(obj, ...args);
    };
    fn._original = obj[val];
    return fn;
  }
  return obj[val];
};
const env = new Nunjucks();
env.addGlobal('static_url', (assetName) => {
  const cdnPrefix = process.env.DEV ? '/' : global.Hydro.model.system.get('server.cdn');
  if (global.Hydro.ui.manifest[assetName]) {
    return `${cdnPrefix}${global.Hydro.ui.manifest[assetName]}`;
  }
  return `${cdnPrefix}${assetName}`;
});
// eslint-disable-next-line no-eval
env.addGlobal('eval', eval);
env.addGlobal('global', global);
env.addGlobal('typeof', (o) => typeof o);
env.addGlobal('datetimeSpan', misc.datetimeSpan);
env.addGlobal('paginate', misc.paginate);
env.addGlobal('size', misc.size);
env.addGlobal('utils', { status });
env.addGlobal('avatarUrl', avatar);
env.addGlobal('formatSeconds', misc.formatSeconds);
env.addGlobal('model', global.Hydro.model);
env.addGlobal('ui', global.Hydro.ui);
env.addGlobal('isIE', (str) => (str ? (str.includes('MSIE') || str.includes('rv:11.0')) : false));
env.addGlobal('set', (obj, key, val) => {
  if (val !== undefined) obj[key] = val;
  else Object.assign(obj, key);
  return '';
});
env.addGlobal('findSubModule', (prefix) => {
  filter(Object.keys(global.Hydro.ui.template), (n) => n.startsWith(prefix));
});
env.addGlobal('parseContestProblemId', (pdoc, tdoc) => {
  if (tdoc.pids[parseInt(pdoc.pid, 36) - 10]) return pdoc.pid;
  let cur = tdoc.pids.indexOf(pdoc.docId);
  if (cur !== -1) return (cur + 10).toString(36).toUpperCase();
  cur = tdoc.pids.indexOf(`${pdoc.domainId}:${pdoc.docId}`);
  return (cur + 10).toString(36).toUpperCase();
});

async function render(name, state) {
  // eslint-disable-next-line no-return-await
  return await new Promise((resolve, reject) => {
    env.render(name, {
      page_name: name.split('.')[0],
      ...state,
      formatJudgeTexts: (texts) => texts.map((text) => {
        if (typeof text === 'string') return text;
        return state._(text.message).format(...text.params || []) + ((process.env.DEV && text.stack) ? `\n${text.stack}` : '');
      }).join('\n'),
      perm: global.Hydro.model.builtin.PERM,
      PRIV: global.Hydro.model.builtin.PRIV,
      STATUS: global.Hydro.model.builtin.STATUS,
      UiContext: state.handler.UiContext,
    }, (err, res) => {
      if (err) reject(err);
      else resolve(res);
    });
  });
}

module.exports = render;

global.Hydro.lib.template = { render };
