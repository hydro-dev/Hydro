import $ from 'jquery';
import Notification from 'vj/components/notification';
import { AutoloadPage } from 'vj/misc/Page';
import { i18n, tpl } from 'vj/utils';

const highlighterPage = new AutoloadPage('highlighterPage', () => {
  import('./prismjs').then(({ default: prismjs }) => {
    function runHighlight($container) {
      $container.find('pre code').get().forEach((code) => {
        const language = ($(code).attr('class') || '').trim();
        if (language.includes('line-numbers')) $(code).parent().addClass('line-numbers');
        const m = language.match(/language-([a-z0-9]+)(\|[\d,-]+)/);
        if (m?.[2]) {
          $(code).parent().attr('data-line', m[2].substring(1));
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
            if ($root.find('.scratchpad-fill-button').length) return;
            const $toolbar = $root.find('.toolbar');
            const $button = $(tpl`
              <div class="toolbar-item scratchpad-fill-button">
                <a href="javascript:;">${i18n('Fill to Pretest')}</a>
              </div>
            `);
            $button.on('click', (e) => {
              const store = (window as any).store;
              if (!store) return;
              e.preventDefault();
              try {
                store.dispatch({
                  type: 'SCRATCHPAD_PRETEST_DATA_CHANGE',
                  payload: {
                    type: 'input',
                    value: $code.text(),
                  },
                });
                Notification.success(i18n('Input filled to pretest!'), 2000);
              } catch (err) {
                Notification.error(i18n('Failed to fill input'));
              }
            });
            $toolbar.append($button);
          }
        }
      });
    }

    runHighlight($('body'));
    $(document).on('vjContentNew', (e) => runHighlight($(e.target)));
  });
});

export default highlighterPage;
