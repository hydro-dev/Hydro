/*

To add a new language to highlight:
1. Add language in babel in package.json
2. Add new import statement in `components/cmeditor/vjcmeditor.js`
3. Add new import statement in `components/scratchpad/ScratchpadEditorContainer.js`
4. Add new meta data in `components/highlighter/meta.js`

 */

import Prism from 'prismjs';

import Clipboard from 'clipboard';
import Notification from 'vj/components/notification';
import i18n from 'vj/utils/i18n';

import languageMeta from './meta';

const languageExtMap = {};

// Map possible language names to Prism language name
languageMeta.forEach((meta) => {
  for (let i = 0; i < meta.ext.length; ++i) {
    if (Prism.languages[meta.ext[i]] !== undefined) {
      // eslint-disable-next-line no-param-reassign
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
  linkCopy.href = 'javascript:;'; // eslint-disable-line no-script-url
  linkCopy.textContent = 'Copy';
  const clip = new Clipboard(linkCopy, { text: () => env.code });
  clip.on('success', () => {
    Notification.success(i18n('Code copied to clipboard!'), 1000);
  });
  clip.on('error', () => {
    Notification.error(i18n('Copy failed :('));
  });
  return linkCopy;
});

const prismjsApiWrap = {
  highlightBlocks: ($dom) => {
    $dom.find('pre code').get().forEach((code) => {
      const $pre = $(code).parent();
      $pre.addClass('syntax-hl');
      if ($pre.closest('[data-syntax-hl-show-line-number]')) {
        $pre.addClass('line-numbers');
      }
      // try to map the language name
      const language = $(code).attr('class');
      const m = (language || '').trim().match(/^language-(.+)$/);
      if (m && m[1]) {
        const languageName = m[1].toLowerCase();
        if (languageExtMap[languageName]) {
          $(code).attr('class', `language-${languageExtMap[languageName]}`);
        }
      }
      Prism.highlightElement(code);
    });
  },
};

export default prismjsApiWrap;
