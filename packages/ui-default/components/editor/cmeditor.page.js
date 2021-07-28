import { AutoloadPage } from 'vj/misc/Page';
import delay from 'vj/utils/delay';
import CmEditor from '.';

function runSubstitute($container) {
  $container.find('textarea[data-markdown]').get().forEach((element) => {
    CmEditor.getOrConstruct($(element));
  });
  $container.find('textarea[data-yaml]').get().forEach((element) => {
    CmEditor.getOrConstruct($(element), { language: 'yaml' });
  });
  $container.find('textarea[data-json]').get().forEach((element) => {
    CmEditor.getOrConstruct($(element), { language: 'json' });
  });
  $container.find('textarea[data-plain]').get().forEach((element) => {
    CmEditor.getOrConstruct($(element), { language: 'plain' });
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
