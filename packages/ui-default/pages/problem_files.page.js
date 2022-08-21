import $ from 'jquery';
import _ from 'lodash';
import { ConfirmDialog, Dialog } from 'vj/components/dialog/index';
import createHint from 'vj/components/hint';
import Notification from 'vj/components/notification';
import { previewFile } from 'vj/components/preview/preview';
import download from 'vj/components/zipDownloader';
import { NamedPage } from 'vj/misc/Page';
import i18n from 'vj/utils/i18n';
import pjax from 'vj/utils/pjax';
import request from 'vj/utils/request';
import tpl from 'vj/utils/tpl';

async function downloadProblemFilesAsArchive(type, files) {
  const { links, pdoc } = await request.post('', { operation: 'get_links', files, type });
  const targets = [];
  for (const filename of Object.keys(links)) targets.push({ filename, url: links[filename] });
  await download(`${pdoc.docId} ${pdoc.title}.zip`, targets);
}

function onBeforeUnload(e) {
  e.returnValue = '';
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
    const dialog = new Dialog({
      $body: `
        <div class="file-label" style="text-align: center; margin-bottom: 5px; color: gray; font-size: small;"></div>
        <div class="bp4-progress-bar bp4-intent-primary bp4-no-stripes">
          <div class="file-progress bp4-progress-meter" style="width: 0"></div>
        </div>
        <div class="upload-label" style="text-align: center; margin: 5px 0; color: gray; font-size: small;"></div>
        <div class="bp4-progress-bar bp4-intent-primary bp4-no-stripes">
          <div class="upload-progress bp4-progress-meter" style="width: 0"></div>
        </div>`,
    });
    try {
      Notification.info(i18n('Uploading files...'));
      window.addEventListener('beforeunload', onBeforeUnload);
      dialog.open();
      const $uploadLabel = dialog.$dom.find('.dialog__body .upload-label');
      const $uploadProgress = dialog.$dom.find('.dialog__body .upload-progress');
      const $fileLabel = dialog.$dom.find('.dialog__body .file-label');
      const $fileProgress = dialog.$dom.find('.dialog__body .file-progress');
      for (const i in files) {
        if (Number.isNaN(+i)) continue;
        const file = files[i];
        const data = new FormData();
        data.append('filename', file.name);
        data.append('file', file);
        data.append('type', type);
        data.append('operation', 'upload_file');
        await request.postFile('', data, {
          xhr() {
            const xhr = new XMLHttpRequest();
            xhr.upload.addEventListener('loadstart', () => {
              $fileLabel.text(`[${+i + 1}/${files.length}] ${file.name}`);
              $fileProgress.width(`${Math.round((+i + 1) / files.length * 100)}%`);
              $uploadLabel.text(i18n('Uploading... ({0}%)', 0));
              $uploadProgress.width(0);
            });
            xhr.upload.addEventListener('progress', (e) => {
              if (e.lengthComputable) {
                const percentComplete = Math.round((e.loaded / e.total) * 100);
                if (percentComplete === 100) $uploadLabel.text(i18n('Processing...'));
                else $uploadLabel.text(i18n('Uploading... ({0}%)', percentComplete));
                $uploadProgress.width(`${percentComplete}%`);
              }
            }, false);
            return xhr;
          },
        });
      }
      window.removeEventListener('beforeunload', onBeforeUnload);
      Notification.success(i18n('File uploaded successfully.'));
      await pjax.request({ push: false });
    } catch (e) {
      window.captureException?.(e);
      console.error(e);
      Notification.error(i18n('File upload failed: {0}', e.toString()));
    } finally {
      dialog.close();
    }
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
    $(document).on('click', '.problem-files-testdata .col--name', (ev) => previewFile(ev, 'testdata'));
    $(document).on('click', '.problem-files-additional_file .col--name', (ev) => previewFile(ev, 'additional_file'));
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
