import $ from 'jquery';
import { AutoloadPage } from 'vj/misc/Page';
import { i18n, tpl } from 'vj/utils';

const highlighterPage = new AutoloadPage('highlighterPage', () => {
  import('./prismjs').then(({ default: prismjs }) => {
    function runHighlight($container) {
      $container.find('pre code').get().forEach((code) => {
        const language = ($(code).attr('class') || '').trim();
        const m = language.match(/language-([a-z0-9]+)(\|[\d,-]+)/);
        if (m?.[2]) {
          $(code).parent().attr('data-line', m[2].substring(1));
          if (language.includes('line-numbers')) $(code).parent().addClass('line-numbers');
          $(code).attr('class', `language-${m[1]}`);
        }
      });
      prismjs.highlightBlocks($container);
      $container.find('pre code').get().forEach((code) => {
        const $code = $(code);
        const $root = $code.parent().parent();
        const $typo = $code.closest('.richmedia');
        const language = ($(code).attr('class') || '').trim();
        const m = language.match(/language-input([0-9]+)/);
        if (m?.[1]) {
          const id = +m[1];
          if (Number.isSafeInteger(id)) {
            const $output = ($typo.length ? $typo : $container).find(`pre.language-output${id}`);
            if ($output.length) {
              const $c = $(document.createElement('div')).addClass('row');
              $root.after($c);
              $root.prepend($(tpl`<h2>${i18n('Sample Input')} ${id}</h2>`))
                .addClass('medium-6 columns sample').appendTo($c);
              $output.parent().prepend($(tpl`<h2>${i18n('Sample Output')} ${id}</h2>`))
                .addClass('medium-6 columns sample').appendTo($c);
            }
          }
        }
      });
    }

    runHighlight($('body'));
    $(document).on('vjContentNew', (e) => runHighlight($(e.target)));
  });
});

export default highlighterPage;
