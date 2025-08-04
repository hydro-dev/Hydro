import Prism from 'prismjs'; // eslint-disable-line

import 'prismjs/plugins/toolbar/prism-toolbar';
import 'prismjs/plugins/toolbar/prism-toolbar.css';
import 'prismjs/plugins/line-numbers/prism-line-numbers';
import 'prismjs/plugins/line-numbers/prism-line-numbers.css';
import 'prismjs/plugins/line-highlight/prism-line-highlight';

import Clipboard from 'clipboard';
import $ from 'jquery';
import components from 'prismjs/components';
import getLoader from 'prismjs/dependencies';
import Notification from 'vj/components/notification/index';
import { i18n } from 'vj/utils';
import languageMeta from './meta';

const files = require.context('prismjs/components/', true, /prism-[a-z0-9-]+\.js/);
const loadedLanguages = new Set();
function loadLanguages() {
  const languages = Object.keys(components.languages).filter((l) => l !== 'meta');
  const loaded = [...loadedLanguages, ...Object.keys(Prism.languages)];
  getLoader(components, languages, loaded).load((lang) => {
    files(`./prism-${lang}.js`);
    loadedLanguages.add(lang);
  });
}

const languageExtMap = {};
loadLanguages();
// Map possible language names to Prism language name
languageMeta.forEach((meta) => {
  for (let i = 0; i < meta.ext.length; ++i) {
    if (Prism.languages[meta.ext[i]] !== undefined) {
      meta.target = meta.ext[i];
      break;
    }
  }
  meta.ext.forEach((ext) => {
    languageExtMap[ext] = meta.target;
  });
});

// Copy to Clipboard
Prism.plugins.toolbar.registerButton('copy-to-clipboard', (env) => {
  const linkCopy = document.createElement('a');
  linkCopy.href = 'javascript:;';
  linkCopy.textContent = 'Copy';
  const clip = new Clipboard(linkCopy, { text: () => env.code });
  clip.on('success', () => {
    Notification.success(i18n('Content copied to clipboard!'), 1000);
  });
  clip.on('error', () => {
    Notification.error(i18n('Copy failed :('));
  });
  return linkCopy;
});

const invisibles = {
  tab: /\t/,
  crlf: /\r\n/,
  lf: /\n/,
  cr: /\r/,
  space: / /,
};

function addInvisibles(grammar) {
  if (!grammar || grammar.tab) return;
  for (const name in invisibles) {
    if (Object.prototype.hasOwnProperty.call(invisibles, name)) {
      grammar[name] = invisibles[name];
    }
  }
  for (const name in grammar) {
    if (Object.prototype.hasOwnProperty.call(grammar, name) && !invisibles[name]) {
      if (name === 'rest') addInvisibles(grammar.rest);
      else handlerInvisiblesToken(grammar, name); // eslint-disable-line ts/no-use-before-define
    }
  }
}

function handlerInvisiblesToken(tokens, name) {
  const value = tokens[name];
  const type = Prism.util.type(value);
  if (type === 'RegExp') {
    const inside = {};
    tokens[name] = { pattern: value, inside };
    addInvisibles(inside);
  } else if (type === 'Array') {
    for (let i = 0, l = value.length; i < l; i++) handlerInvisiblesToken(value, i);
  } else {
    value.inside ||= {};
    addInvisibles(value.inside);
  }
}

Prism.hooks.add('before-highlight', (env) => {
  if (UserContext.showInvisibleChar) addInvisibles(env.grammar);
});

const prismjsApiWrap = {
  highlightBlocks: ($dom) => {
    $dom.find('pre code').get().forEach((code) => {
      const $code = $(code);
      const $pre = $code.parent();
      $pre.addClass('syntax-hl');
      const language = ($(code).attr('class') || '').trim();
      // try to map the language name
      const m = language.match(/language-([a-z]+)/);
      if (m && m[1]) {
        const languageName = m[1].toLowerCase();
        if (languageExtMap[languageName]) {
          $(code).attr('class', `language-${languageExtMap[languageName]}`);
        }
      }
      Prism.highlightElement(code);
    });
  },
  highlight: (text, grammar, language) => Prism.highlight(text, grammar, language),
  Prism,
};

export default prismjsApiWrap;
