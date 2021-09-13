import { AutoloadPage } from 'vj/misc/Page';
import load from 'vj/components/wastyle/index';
import Notification from 'vj/components/notification/index';
import tpl from 'vj/utils/tpl';
import i18n from 'vj/utils/i18n';

const highlighterPage = new AutoloadPage('highlighterPage', () => {
  Promise.all([
    import('./prismjs'),
    UserContext.formatCode ? load() : [true, null],
  ]).then(([{ default: prismjs }, [success, format]]) => {
    if (!success) Notification.error(`Astyle load fail: ${format}`);
    function runHighlight($container) {
      prismjs.highlightBlocks($container, success ? format : null);
      $container.find('pre code').get().forEach((code) => {
        const $code = $(code);
        const $root = $code.parent().parent();
        const language = ($(code).attr('class') || '').trim();
        const m = language.match(/language-([a-z0-9]+)/);
        if (m && m[1] && m[1].toLowerCase().startsWith('input')) {
          const id = +m[1].substr(5, m[1].length - 5);
          if (Number.isSafeInteger(id)) {
            const $output = $container.find(`pre.language-output${id}`);
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
