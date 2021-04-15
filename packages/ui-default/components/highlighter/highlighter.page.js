import { AutoloadPage } from 'vj/misc/Page';
import load from 'vj/components/wastyle/index';
import Notification from 'vj/components/notification/index';

const highlighterPage = new AutoloadPage('highlighterPage', async () => {
  const [{ default: prismjs }, [success, format]] = await Promise.all([
    import('./prismjs'),
    load(),
  ]);
  if (!success) Notification.error(`Astyle load fail: ${format}`);
  function runHighlight($container) {
    prismjs.highlightBlocks($container, success ? format : null);
  }
  runHighlight($('body'));
  $(document).on('vjContentNew', (e) => runHighlight($(e.target)));
});

export default highlighterPage;
