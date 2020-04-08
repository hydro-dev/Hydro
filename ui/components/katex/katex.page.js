import { AutoloadPage } from 'vj/misc/PageLoader';

import 'katex/dist/katex.min.css';
import './katex.styl';

const katexPage = new AutoloadPage('katexPage', () => {
  import('katex/dist/contrib/auto-render.min.js').then((renderKatex) => {
    function runKatex($containers) {
      $containers.get().forEach(container => renderKatex(container));
    }
    runKatex($('.typo'));
    $(document).on('vjContentNew', e => runKatex($(e.target).find('.typo')));
  });
});

export default katexPage;
