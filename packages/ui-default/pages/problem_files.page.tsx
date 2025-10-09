import { STATUS } from '@hydrooj/common';
import $ from 'jquery';
import FileSelectAutoComplete from 'vj/components/autocomplete/FileSelectAutoComplete';
import { InfoDialog } from 'vj/components/dialog/index';
import createHint from 'vj/components/hint';
import Notification from 'vj/components/notification';
import { previewFile } from 'vj/components/preview/preview.page';
import download from 'vj/components/zipDownloader';
import { NamedPage } from 'vj/misc/Page';
import {
  i18n, pjax, request, tpl,
} from 'vj/utils';

function ensureAndGetSelectedFiles(type = '') {
  const allChecked = $(`.files tbody [data-checkbox-group="${type}"]:checked`);
  const files = allChecked.get().map((i) => $(i).closest('tr').attr('data-filename'));
  if (files.length === 0) {
    Notification.error(i18n('Please select at least one file to perform this operation.'));
    return null;
  }
  return files;
}

const page = new NamedPage('problem_files', () => {
  async function handleClickDownloadSelected(ev) {
    const type = $(ev.currentTarget).closest('[data-type]').attr('data-type');
    const files = ensureAndGetSelectedFiles(type);
    if (files === null) return;
    const { links, pdoc } = await request.post('', { operation: 'get_links', files, type });
    const targets = [];
    for (const filename of Object.keys(links)) targets.push({ filename, url: links[filename] });
    await download(`${pdoc.docId} ${pdoc.title} ${type}.zip`, targets);
  }

  async function handleGenerateTestdata(ev) {
    ev.preventDefault();
    const gen = $('[name=gen]').val();
    const std = $('[name=std]').val();
    if (!gen) {
      Notification.error(i18n('Please input the generator.'));
      return;
    }
    if (!std) {
      Notification.error(i18n('Please input the standard program.'));
      return;
    }
    try {
      const res = await request.post('', {
        operation: 'generate_testdata',
        gen,
        std,
      });
      if (res.error) Notification.error(res.error);
      else {
        Notification.success(i18n('Generating...'));
        const dialog = new InfoDialog({
          $body: tpl`
            <div class="typo">
              <iframe src="${res.url}"
                scrolling="yes" border="0" frameborder="no" framespacing="0" width="100%" style="height: 70vh;"></iframe>
            </div>`,
          width: `${window.innerWidth - 200}px`,
          height: `${window.innerHeight - 100}px`,
        });
        const callback = (data: MessageEvent<any>) => {
          if (data.data.status === STATUS.STATUS_ACCEPTED) {
            dialog.close();
            Notification.success('Testdata generated successfully.');
          }
        };
        window.addEventListener('message', callback, false);
        await dialog.open();
        window.removeEventListener('message', callback, false);
        await pjax.request({ push: false });
      }
    } catch (error) {
      Notification.error([error.message, ...error.params].join(' '));
    }
  }

  if (UiContext.pdoc && $('[name="generate_testdata"]').length) {
    FileSelectAutoComplete.getOrConstruct($('[name=gen]'), { data: UiContext.pdoc.data });
    FileSelectAutoComplete.getOrConstruct($('[name=std]'), { data: UiContext.pdoc.data });
    $('[name="generate_testdata"]').on('click', handleGenerateTestdata);
  }
  $(document).on('click', '[name="create_testdata"]', () => previewFile(undefined, 'testdata'));
  $(document).on('click', '[name="create_file"]', () => previewFile(undefined, 'additional_file'));
  $(document).on('click', '[name="download_selected"]', (ev) => handleClickDownloadSelected(ev));
  $(document).on('vjContentNew', (e) => {
    createHint('Hint::icon::testdata', $(e.target).find('[name="create_testdata"]').get(0)?.parentNode?.parentNode?.children?.[0]);
  });
  createHint('Hint::icon::testdata', $(document).find('[name="create_testdata"]').get(0)?.parentNode?.parentNode?.children?.[0]);
});

export default page;
