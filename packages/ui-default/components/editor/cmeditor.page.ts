import { AutoloadPage } from 'vj/misc/Page';
import delay from 'vj/utils/delay';
import CmEditor from '.';

function runSubstitute($container: JQuery<Document | HTMLElement>) {
  for (const language of ['markdown', 'yaml', 'json', 'plain']) {
    $container.find(`textarea[data-${language}]`).get().forEach((element) => {
      CmEditor.getOrConstruct($(element), { language });
    });
  }
}

const cmEditorPage = new AutoloadPage('cmEditorPage', () => {
  runSubstitute($('body'));
  $(document).on('vjContentNew', async (e) => {
    await delay(0);
    runSubstitute($(e.target));
  });
});

export default cmEditorPage;
