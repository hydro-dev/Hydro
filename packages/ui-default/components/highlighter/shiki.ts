import {
  transformerMetaHighlight, transformerNotationDiff, transformerNotationHighlight,
  transformerNotationWordHighlight, transformerRenderWhitespace,
} from '@shikijs/transformers';
import $ from 'jquery';
import {
  bundledLanguages,
  bundledLanguagesAlias,
  createHighlighter,
} from 'shiki/bundle/web';
import Notification from 'vj/components/notification/index';
import { i18n } from 'vj/utils';

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
  const eles = $dom.find('pre code').get();
  const langs = Array.from(new Set(eles.map((code) => {
    const language = ($(code).attr('class') || '').trim();
    const m = language.match(/language-([a-z0-9]+)/);
    return m ? m[1] : null;
  }))).filter((i: string) => i && (bundledLanguages[i] || bundledLanguagesAlias[i])) as string[];
  const shiki = await createHighlighter({ langs, themes: ['github-dark', 'light-plus'] });
  for (const code of eles) {
    const $code = $(code);
    const $pre = $code.parent();
    if ($pre.hasClass('syntax-hl')) continue;
    const language = ($(code).attr('class') || '').trim();
    console.log(language);
    // try to map the language name
    const m = language.match(/language-([a-z0-9]+)(?=\.line-numbers)?(?=\|([\d,-]+))?/);
    if (!m) continue;
    $pre.replaceWith($(shiki.codeToHtml($code.text(), {
      lang: m[1],
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
