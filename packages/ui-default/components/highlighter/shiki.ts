import {
  transformerMetaHighlight, transformerNotationDiff, transformerNotationHighlight,
  transformerNotationWordHighlight, transformerRenderWhitespace,
} from '@shikijs/transformers';
import type { ElementContent } from 'hast';
import $ from 'jquery';
import Notification from 'vj/components/notification/index';
import { getFeatures, load as loadModule } from 'vj/lazyload';
import { i18n } from 'vj/utils';
import {
  addLanguage, bundledLanguages, bundledLanguagesInfo, bundledThemes, createHighlighter,
} from './bundle';

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

function getTransformers() {
  const baseTransformers = [
    transformerNotationDiff(),
    transformerNotationHighlight(),
    transformerNotationWordHighlight(),
    transformerMetaHighlight(),
  ];

  if (UserContext.showInvisibleChar) {
    baseTransformers.push(transformerRenderWhitespace());
  }
  return baseTransformers;
}

let theme = UiContext.highlightTheme;
if (!bundledThemes[theme]) theme = 'vitesse-light';
async function highlightBlocks($dom) {
  const nodes = $dom.find('pre code').get();
  if (!nodes.length) return;
  const shikiPlain = await createHighlighter({ langs: ['text'], themes: [theme] });
  const requestedLanguages = new Set<string>([]);
  const tasks = [];
  for (const code of nodes) {
    const $code = $(code);
    const $pre = $code.parent();
    if ($pre.hasClass('syntax-hl')) continue;
    const language = ($(code).attr('class') || '').trim();
    // try to map the language name
    const m = language.match(/language-([a-zA-Z0-9]+)(?=\.line-numbers)?(?=\|([\d,-]+))?/);
    if (!m) continue;
    const name = m[1].toLowerCase();
    const toolbarContents: ElementContent[] = [
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
    ];
    if (!name.startsWith('input') && !name.startsWith('output')) {
      toolbarContents.unshift({
        tagName: 'span',
        type: 'element',
        properties: {
          style: 'padding: 0 10px 0 10px',
        },
        children: [
          { type: 'text', value: bundledLanguagesInfo[m[1]]?.name || m[1] },
        ],
      });
    }
    const toolbar: ElementContent = {
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
          children: toolbarContents,
        },
      ],
    };
    const transformers = getTransformers().concat({
      pre(node) {
        this.addClassToHast(node, 'syntax-hl');
        if (language.includes('line-numbers')) {
          this.addClassToHast(node, 'line-numbers');
        }
        node.children.push(toolbar);
      },
    });
    const $plain = $(shikiPlain.codeToHtml($code.text(), {
      lang: 'text',
      theme,
      meta: {
        __raw: m[2] ? `{${m[2]}}` : null,
      },
      transformers,
    }));
    $pre.replaceWith($plain);
    requestedLanguages.add(name);
    tasks.push((shiki) => {
      if (!bundledLanguages[name]) return;
      $plain.replaceWith($(shiki.codeToHtml($code.text(), {
        lang: name,
        theme,
        meta: {
          __raw: m[2] ? `{${m[2]}}` : null,
        },
        transformers,
      })));
    });
  }
  for (const name of requestedLanguages) {
    if (!bundledLanguages[name]) {
      const features = await getFeatures(`shiki-${name}`);
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
    if (!bundledLanguages[name]) requestedLanguages.delete(name);
  }
  const shiki = await createHighlighter({ langs: Array.from(requestedLanguages), themes: [theme] });
  for (const task of tasks) task(shiki);
}

async function highlight(text: string, grammar, language) {
  const shiki = await createHighlighter({ langs: [language], themes: [theme] });
  return shiki.codeToHtml(text, { lang: language, theme, transformers: getTransformers() });
}

export {
  bundledThemes,
  highlightBlocks,
  highlight,
  createHighlighter,
  getTransformers,
};
