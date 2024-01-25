import { AutoloadPage } from 'vj/misc/Page';
import { delay } from 'vj/utils';
import CmEditor from '.';

function runSubstitute($container: JQuery<Document | HTMLElement>) {
  for (const language of ['markdown', 'yaml', 'json', 'plain']) {
    $container.find(`textarea[data-${language}]`).get().forEach((element) => {
      const config: any = { language };
      if ($(element).data('model')) config.model = $(element).data('model');
      CmEditor.getOrConstruct($(element), config);
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
