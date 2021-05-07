import { WritableStream } from 'web-streams-polyfill/dist/ponyfill.es6';
import * as streamsaver from 'streamsaver';
import _ from 'lodash';
import { createZipStream } from 'vj/utils/zip';
import { NamedPage } from 'vj/misc/Page';
import Notification from 'vj/components/notification';
import { ConfirmDialog } from 'vj/components/dialog';
import request from 'vj/utils/request';
import pipeStream from 'vj/utils/pipeStream';
import tpl from 'vj/utils/tpl';
import delay from 'vj/utils/delay';
import i18n from 'vj/utils/i18n';

// Firefox have no WritableStream
if (!window.WritableStream) streamsaver.WritableStream = WritableStream;
if (window.location.protocol === 'https:'
  || window.location.protocol === 'chrome-extension:'
  || window.location.hostname === 'localhost') {
  streamsaver.mitm = '/streamsaver/mitm.html';
}

async function downloadProblemFilesAsArchive(type, files) {
  const { links, pdoc } = await request.post('', { operation: 'get_links', files, type });
  const fileStream = streamsaver.createWriteStream(`${pdoc.docId} ${pdoc.title}.zip`);
  let i = 0;
  const targets = [];
  for (const filename of Object.keys(links)) targets.push({ filename, downloadUrl: links[filename] });
  const zipStream = createZipStream({
    // eslint-disable-next-line consistent-return
    async pull(ctrl) {
      if (i === targets.length) return ctrl.close();
      try {
        const response = await fetch(targets[i].downloadUrl);
        if (!response.ok) throw response.statusText;
        ctrl.enqueue({
          name: targets[i].filename,
          stream: () => response.body,
        });
      } catch (e) {
        // eslint-disable-next-line no-use-before-define
        stopDownload();
        Notification.error(i18n('problem_files.download_as_archive_error', [targets[i].filename, e.toString()]));
      }
      i++;
    },
  });
  const abortCallbackReceiver = {};
  function stopDownload() { abortCallbackReceiver.abort(); }
  let isBeforeUnloadTriggeredByLibrary = !window.isSecureContext;
  function onBeforeUnload(e) {
    if (isBeforeUnloadTriggeredByLibrary) {
      isBeforeUnloadTriggeredByLibrary = false;
      return;
    }
    e.returnValue = '';
  }
  window.addEventListener('unload', stopDownload);
  window.addEventListener('beforeunload', onBeforeUnload);
  await pipeStream(zipStream, fileStream, abortCallbackReceiver);
  window.removeEventListener('unload', stopDownload);
  window.removeEventListener('beforeunload', onBeforeUnload);
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
    try {
      Notification.info('Uploading files...');
      const tasks = [];
      for (const file of files) {
        const data = new FormData();
        data.append('filename', file.name);
        data.append('file', file);
        data.append('type', type);
        data.append('operation', 'upload_file');
        tasks.push(request.postFile('', data));
      }
      await Promise.all(tasks);
      Notification.success('File uploaded successfully.');
      await delay(2000);
      window.location.reload();
    } catch (e) {
      console.error(e);
      Notification.error(`File upload fail: ${e.toString()}`);
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
      $body: tpl`
        <div class="typo">
          <p>${i18n('Confirm to delete the selected files?')}</p>
        </div>`,
    }).open();
    if (action !== 'yes') return;
    try {
      await request.post('', {
        operation: 'delete_files',
        files: selectedFiles,
        type,
      });
      Notification.success(i18n('Selected files have been deleted.'));
      await delay(2000);
      window.location.reload();
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

  $('.problem-files-testdata').on('dragover', (ev) => handleDragOver('testdata', ev));
  $('.problem-files-additional_file').on('dragover', (ev) => handleDragOver('additional_file', ev));
  $('.problem-files-testdata').on('drop', (ev) => handleDrop('testdata', ev));
  $('.problem-files-additional_file').on('drop', (ev) => handleDrop('additional_file', ev));
  $('[name="upload_testdata"]').on('click', () => handleClickUpload('testdata'));
  $('[name="download_selected_testdata"]').on('click', () => handleClickDownloadSelected('testdata'));
  $('[name="remove_selected_testdata"]').on('click', () => handleClickRemoveSelected('testdata'));
  $('[name="upload_file"]').on('click', () => handleClickUpload('additional_file'));
  $('[name="download_selected_file"]').on('click', () => handleClickDownloadSelected('additional_file'));
  $('[name="remove_selected_file"]').on('click', () => handleClickRemoveSelected('additional_file'));
});

export default page;
