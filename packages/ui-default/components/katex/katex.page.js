import { AutoloadPage } from 'vj/misc/Page';

const katexPage = new AutoloadPage('katexPage', () => {
  import('katex/contrib/auto-render/auto-render').then(({ default: katex }) => {
    function runKatex($containers) {
      $containers.get().forEach((container) => katex(container));
    }
    runKatex($('.typo'));
    $(document).on('vjContentNew', (e) => runKatex($(e.target).find('.typo')));
  });
});

export default katexPage;
