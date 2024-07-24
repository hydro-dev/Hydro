import {
  transformerMetaHighlight, transformerNotationDiff, transformerNotationHighlight,
  transformerNotationWordHighlight, transformerRenderWhitespace,
} from '@shikijs/transformers';
import $ from 'jquery';
import Notification from 'vj/components/notification/index';
import { getFeatures, load as loadModule } from 'vj/lazyload';
import { i18n } from 'vj/utils';
import { addLanguage, bundledLanguages, createHighlighter } from './bundle';

$(document).on('click', '[data-clipboard-text]', function (ev) {
  const content = $(this).attr('data-clipboard-text');
  const $temp = $('<textarea>');
  $('body').append($temp);
  $temp.val(content).select();
  document.execCommand('copy');
  $temp.remove();
  Notification.success(i18n('Content copied to clipboard!'), 1000);
  ev.preventDefault();
});

const transformers = [
  transformerNotationDiff(),
  transformerNotationHighlight(),
  transformerNotationWordHighlight(),
  transformerMetaHighlight(),
];

if (UserContext.showInvisibleChar) {
  transformers.push(transformerRenderWhitespace());
}

async function highlightBlocks($dom) {
  for (const code of $dom.find('pre code').get()) {
    const $code = $(code);
    const $pre = $code.parent();
    if ($pre.hasClass('syntax-hl')) continue;
    const language = ($(code).attr('class') || '').trim();
    // try to map the language name
    const m = language.match(/language-([a-z0-9]+)(?=\.line-numbers)?(?=\|([\d,-]+))?/);
    if (!m) continue;
    if (!bundledLanguages[m[1]]) {
      const features = await getFeatures(`shiki-${m[1]}`);
      for (const item of features) {
        let apply = typeof item === 'function'
          ? item
          : (item.startsWith('http') || item.startsWith('/'))
            ? await loadModule(item)
            : (await loadModule(item)).apply;
        if (typeof apply !== 'function') apply = apply.default || apply.apply;
        if (typeof apply === 'function') await apply(addLanguage);
      }
    }
    const highlightLang = bundledLanguages[m[1]] ? m[1] : 'none';
    const shiki = await createHighlighter({
      langs: [highlightLang],
      themes: ['github-dark', 'light-plus'],
    });
    $pre.replaceWith($(shiki.codeToHtml($code.text(), {
      lang: highlightLang,
      theme: 'light-plus',
      meta: {
        __raw: m[2] ? `{${m[2]}}` : null,
      },
      transformers: transformers.concat({
        pre(node) {
          this.addClassToHast(node, 'syntax-hl');
          if (language.includes('line-numbers')) {
            this.addClassToHast(node, 'line-numbers');
          }
          node.children.push({
            tagName: 'div',
            type: 'element',
            properties: {
              class: 'toolbar',
            },
            children: [
              {
                tagName: 'div',
                type: 'element',
                properties: {
                  class: 'toolbar-item',
                },
                children: [
                  {
                    tagName: 'a',
                    type: 'element',
                    properties: {
                      href: 'javascript:;',
                      class: 'copy-to-clipboard',
                      'data-clipboard-text': $code.text(),
                    },
                    children: [
                      { type: 'text', value: 'Copy' },
                    ],
                  },
                ],
              },
            ],
          });
        },
      }),
    })));
  }
}

async function highlight(text: string, grammar, language) {
  const shiki = await createHighlighter({ langs: [language], themes: ['github-dark', 'light-plus'] });
  return shiki.codeToHtml(text, { lang: language, theme: 'light-plus' });
}

export {
  highlightBlocks,
  highlight,
  createHighlighter,
};
