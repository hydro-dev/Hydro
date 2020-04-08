import { AutoloadPage } from 'vj/misc/PageLoader';

const highlighterPage = new AutoloadPage('highlighterPage', () => {
  import('./prismjs').then((module) => {
    const prismjs = module.default;
    function runHighlight($container) {
      prismjs.highlightBlocks($container);
    }
    runHighlight($('body'));
    $(document).on('vjContentNew', e => runHighlight($(e.target)));
  });
});

export default highlighterPage;
