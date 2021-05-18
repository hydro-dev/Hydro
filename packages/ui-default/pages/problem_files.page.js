import { WritableStream } from 'web-streams-polyfill/dist/ponyfill.es6';
import * as streamsaver from 'streamsaver';
import _ from 'lodash';
import { createZipStream } from 'vj/utils/zip';
import { NamedPage } from 'vj/misc/Page';
import Notification from 'vj/components/notification';
import { ConfirmDialog, ActionDialog } from 'vj/components/dialog/index';
import request from 'vj/utils/request';
import pjax from 'vj/utils/pjax';
import pipeStream from 'vj/utils/pipeStream';
import tpl from 'vj/utils/tpl';
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
      Notification.info(i18n('Uploading files...'));
      const tasks = [];
      const dialog = new Dialog({
        $body: `<div class="upload-label" style="text-align: center;margin-bottom: 8px;color: gray;"></div>
                <div class="bp3-progress-bar bp3-intent-primary bp3-no-stripes">
                  <div class="upload-progress bp3-progress-meter" style="width: 0"></div>
                </div>
                <div class="file-label" style="text-align: center;margin: 5px 0;color: gray;font-size: small;"></div>
                <div class="bp3-progress-bar bp3-intent-primary bp3-no-stripes">
                  <div class="file-progress bp3-progress-meter" style="width: 0"></div>
                </div>`,
      });
      const $uploadLabel = dialog.$dom.find('.dialog__body .upload-label');
      const $uploadProgress = dialog.$dom.find('.dialog__body .upload-progress');
      const $fileLabel = dialog.$dom.find('.dialog__body .file-label');
      const $fileProgress = dialog.$dom.find('.dialog__body .file-progress');
      let processed = 0;
      for (const file of files) {
        const data = new FormData();
        data.append('filename', file.name);
        data.append('file', file);
        data.append('type', type);
        data.append('operation', 'upload_file');
        tasks.push(request.postFile('', data, {
          xhr() {
            const xhr = new window.XMLHttpRequest();
            xhr.upload.addEventListener("loadstart", () => {
              processed++;
              $fileLabel.text(`[${processed}/${files.length}] ${file.name}`);
              $fileProgress.css({ width: `${parseInt(processed / file.length * 100)}%` });
              $uploadLabel.text(i18n("Uploading... ({0}%)", 0));
              $uploadProgress.css({ width: 0 });
            });
            xhr.upload.addEventListener("progress", (e) => {
              if (e.lengthComputable) {
                let percentComplete = e.loaded / e.total;
                percentComplete = parseInt(percentComplete * 100);
                $uploadLabel.text(i18n("Uploading... ({0}%)", percentComplete));
                $uploadProgress.css({ width: `${percentComplete}%` });
              }
            }, false);
            return xhr;
          },
        }));
      }
      dialog.open();
      await Promise.all(tasks);
      Notification.success(i18n('File uploaded successfully.'));
      await delay(2000);
      window.location.reload();
    } catch (e) {
      console.error(e);
      Notification.error(i18n('File upload failed: {0}', e.toString()));
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

  async function startEdit(filename, value) {
    console.log(filename, value);
    const { default: Editor } = await import('vj/components/editor/index');
    const promise = new ActionDialog({
      $body: tpl`
        <div class="typo" style="width: 100%; height: 100%">
          <textarea name="fileContent" style="width: 100%; height: 100%"></textarea>
        </div>`,
      width: `${window.innerWidth - 200}px`,
      height: `${window.innerHeight - 100}px`,
    }).open();
    const editor = new Editor($('[name="fileContent"]'), { value, autoResize: false, autoLayout: false });
    const action = await promise;
    value = editor.value();
    editor.destory();
    if (action !== 'ok') return null;
    return value;
  }
  /**
   * @param {string} type
   * @param {JQuery.ClickEvent<HTMLElement, undefined, HTMLElement, HTMLElement>} ev
   */
  async function handleEdit(type, ev) {
    if (ev) ev.preventDefault();
    const filename = ev
      ? ev.currentTarget.closest('[data-filename]').getAttribute('data-filename')
      // eslint-disable-next-line no-alert
      : prompt('Filename');
    const filesize = ev
      ? +ev.currentTarget.closest('[data-size]').getAttribute('data-size')
      : 0;
    let content = '';
    if (ev) {
      const link = $(ev.currentTarget).find('a').attr('href');
      if (!link) return;
      if (filesize > 8 * 1024 * 1024) Notification.error(i18n('file too large'));
      Notification.info(i18n('Loading file...'));
      const res = await request.get(link);
      content = await request.get(res.url, undefined, { dataType: 'text' });
    } else Notification.info(i18n('Loading editor...'));
    const val = await startEdit(filename, content);
    console.log(val);
    if (typeof val !== 'string') return;
    Notification.info(i18n('Saving file...'));
    const data = new FormData();
    data.append('filename', filename);
    data.append('file', new Blob([val], { type: 'text/plain' }));
    data.append('type', type);
    data.append('operation', 'upload_file');
    await request.postFile('', data);
    Notification.success(i18n('File saved.'));
    await pjax.request({ push: false });
  }

  if ($('[name="remove_selected_testdata"]').length) {
    $('.problem-files-testdata .col--name').on('click', (ev) => handleEdit('testdata', ev));
    $('.problem-files-additional_file .col--name').on('click', (ev) => handleEdit('additional_file', ev));
    $('.problem-files-testdata').on('dragover', (ev) => handleDragOver('testdata', ev));
    $('.problem-files-additional_file').on('dragover', (ev) => handleDragOver('additional_file', ev));
    $('.problem-files-testdata').on('drop', (ev) => handleDrop('testdata', ev));
    $('.problem-files-additional_file').on('drop', (ev) => handleDrop('additional_file', ev));
    $('[name="upload_testdata"]').on('click', () => handleClickUpload('testdata'));
    $('[name="upload_file"]').on('click', () => handleClickUpload('additional_file'));
    $('[name="create_testdata"]').on('click', () => handleEdit('testdata'));
    $('[name="create_file"]').on('click', () => handleEdit('additional_file'));
    $('[name="remove_selected_testdata"]').on('click', () => handleClickRemoveSelected('testdata'));
    $('[name="remove_selected_file"]').on('click', () => handleClickRemoveSelected('additional_file'));
  }
  $('[name="download_selected_testdata"]').on('click', () => handleClickDownloadSelected('testdata'));
  $('[name="download_selected_file"]').on('click', () => handleClickDownloadSelected('additional_file'));
});

export default page;
