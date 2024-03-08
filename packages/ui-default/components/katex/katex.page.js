import $ from 'jquery';
import { AutoloadPage } from 'vj/misc/Page';

const katexPage = new AutoloadPage('katexPage', () => {
  import('katex/contrib/auto-render/auto-render').then(({ default: katex }) => {
    function runKatex($containers) {
      $containers.get().forEach((container) => katex(container, {
        delimiters: [
          { left: '$$', right: '$$', display: true },
          { left: '$', right: '$', display: false },
          { left: '\\(', right: '\\)', display: false },
          { left: '\\[', right: '\\]', display: true },
          { left: '\\begin{equation}', right: '\\end{equation}', display: true },
          { left: '\\begin{align}', right: '\\end{align}', display: true },
          { left: '\\begin{alignat}', right: '\\end{alignat}', display: true },
          { left: '\\begin{gather}', right: '\\end{gather}', display: true },
          { left: '\\begin{CD}', right: '\\end{CD}', display: true },
        ],
      }));
    }
    runKatex($('.richmedia'));
    $(document).on('vjContentNew', (e) => runKatex($(e.target).find('.richmedia').addBack('.richmedia')));
  });
});

export default katexPage;
