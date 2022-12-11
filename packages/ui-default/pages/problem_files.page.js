import $ from 'jquery';
import _ from 'lodash';
import { ConfirmDialog } from 'vj/components/dialog/index';
import createHint from 'vj/components/hint';
import Notification from 'vj/components/notification';
import { previewFile } from 'vj/components/preview/preview.page';
import uploadFiles from 'vj/components/upload';
import download from 'vj/components/zipDownloader';
import { NamedPage } from 'vj/misc/Page';
import {
  i18n, pjax, request, tpl,
} from 'vj/utils';

async function downloadProblemFilesAsArchive(type, files) {
  const { links, pdoc } = await request.post('', { operation: 'get_links', files, type });
  const targets = [];
  for (const filename of Object.keys(links)) targets.push({ filename, url: links[filename] });
  await download(`${pdoc.docId} ${pdoc.title}.zip`, targets);
}

const page = new NamedPage('problem_files', () => {
  function ensureAndGetSelectedFiles(type) {
    const files = _.map(
      $(`.problem-files-${type} tbody [data-checkbox-group="${type}"]:checked`),
      (ch) => $(ch).closest('tr').attr('data-filename'),
    );
    if (files.length === 0) {
      Notification.error(i18n('Please select at least one file to perform this operation.'));
      return null;
    }
    return files;
  }

  async function handleClickUpload(type, files) {
    if (!files) {
      const input = document.createElement('input');
      input.type = 'file';
      input.multiple = true;
      input.click();
      await new Promise((resolve) => { input.onchange = resolve; });
      files = input.files;
    }
    if (!files.length) {
      Notification.warn(i18n('No file selected.'));
      return;
    }
    await uploadFiles('', files, { type, pjax: true });
  }

  async function handleClickDownloadSelected(type) {
    const selectedFiles = ensureAndGetSelectedFiles(type);
    if (selectedFiles === null) return;
    await downloadProblemFilesAsArchive(type, selectedFiles);
  }

  async function handleClickRemoveSelected(type) {
    const selectedFiles = ensureAndGetSelectedFiles(type);
    if (selectedFiles === null) return;
    const action = await new ConfirmDialog({
      $body: tpl.typoMsg(i18n('Confirm to delete the selected files?')),
    }).open();
    if (action !== 'yes') return;
    try {
      await request.post('', {
        operation: 'delete_files',
        files: selectedFiles,
        type,
      });
      Notification.success(i18n('Selected files have been deleted.'));
      await pjax.request({ push: false });
    } catch (error) {
      Notification.error(error.message);
    }
  }

  /**
   * @param {string} type
   * @param {JQuery.DragOverEvent<HTMLElement, undefined, HTMLElement, HTMLElement>} ev
   */
  function handleDragOver(type, ev) {
    ev.preventDefault();
    // TODO display a drag-drop allowed hint
  }

  /**
   * @param {string} type
   * @param {JQuery.DropEvent<HTMLElement, undefined, HTMLElement, HTMLElement>} ev
   */
  function handleDrop(type, ev) {
    ev.preventDefault();
    if (!$('[name="upload_testdata"]').length) {
      Notification.error(i18n("You don't have permission to upload file."));
      return;
    }
    ev = ev.originalEvent;
    const files = [];
    if (ev.dataTransfer.items) {
      for (let i = 0; i < ev.dataTransfer.items.length; i++) {
        if (ev.dataTransfer.items[i].kind === 'file') {
          const file = ev.dataTransfer.items[i].getAsFile();
          files.push(file);
        }
      }
    } else {
      for (let i = 0; i < ev.dataTransfer.files.length; i++) {
        files.push(ev.dataTransfer.files[i]);
      }
    }
    handleClickUpload(type, files);
  }

  if ($('[name="upload_testdata"]').length) {
    $(document).on('click', '[name="upload_testdata"]', () => handleClickUpload('testdata'));
    $(document).on('click', '[name="upload_file"]', () => handleClickUpload('additional_file'));
    $(document).on('click', '[name="create_testdata"]', () => previewFile(undefined, 'testdata'));
    $(document).on('click', '[name="create_file"]', () => previewFile(undefined, 'additional_file'));
    $(document).on('click', '[name="remove_selected_testdata"]', () => handleClickRemoveSelected('testdata'));
    $(document).on('click', '[name="remove_selected_file"]', () => handleClickRemoveSelected('additional_file'));
  }
  $(document).on('dragover', '.problem-files-testdata', (ev) => handleDragOver('testdata', ev));
  $(document).on('dragover', '.problem-files-additional_file', (ev) => handleDragOver('additional_file', ev));
  $(document).on('drop', '.problem-files-testdata', (ev) => handleDrop('testdata', ev));
  $(document).on('drop', '.problem-files-additional_file', (ev) => handleDrop('additional_file', ev));
  $(document).on('click', '[name="download_selected_testdata"]', () => handleClickDownloadSelected('testdata'));
  $(document).on('click', '[name="download_selected_file"]', () => handleClickDownloadSelected('additional_file'));
  $(document).on('vjContentNew', (e) => {
    createHint('Hint::icon::testdata', $(e.target).find('[name="create_testdata"]').get(0)?.parentNode?.parentNode?.children?.[0]);
  });
  createHint('Hint::icon::testdata', $(document).find('[name="create_testdata"]').get(0)?.parentNode?.parentNode?.children?.[0]);
});

export default page;
