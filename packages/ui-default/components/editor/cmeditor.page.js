import { AutoloadPage } from 'vj/misc/Page';
import delay from 'vj/utils/delay';
import CmEditor from '.';

function runSubstitute($container) {
  const selector = ['textarea[data-markdown]'];
  $container.find(selector.join(', ')).get().forEach((element) => {
    CmEditor.getOrConstruct($(element));
  });
}

const cmEditorPage = new AutoloadPage('cmEditorPage', () => {
  runSubstitute($('body'));
  $(document).on('vjContentNew', async (e) => {
    await delay(0);
    runSubstitute($(e.target));
  });
});

export default cmEditorPage;
