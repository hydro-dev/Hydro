import _ from 'lodash';
import Clipboard from 'clipboard';
import { NamedPage } from 'vj/misc/Page';
import Notification from 'vj/components/notification';
import { ConfirmDialog, Dialog } from 'vj/components/dialog/index';
import request from 'vj/utils/request';
import pjax from 'vj/utils/pjax';
import tpl from 'vj/utils/tpl';
import i18n from 'vj/utils/i18n';

function onBeforeUnload(e) {
  e.returnValue = '';
}

function ensureAndGetSelectedFiles() {
  const files = _.map(
    $('.home-files tbody [data-checkbox-group="user_files"]:checked'),
    (ch) => $(ch).closest('tr').attr('data-filename'),
  );
  if (files.length === 0) {
    Notification.error(i18n('Please select at least one file to perform this operation.'));
    return null;
  }
  return files;
}

async function handleClickUpload(files) {
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
      <div class="bp3-progress-bar bp3-intent-primary bp3-no-stripes">
        <div class="file-progress bp3-progress-meter" style="width: 0"></div>
      </div>
      <div class="upload-label" style="text-align: center; margin: 5px 0; color: gray; font-size: small;"></div>
      <div class="bp3-progress-bar bp3-intent-primary bp3-no-stripes">
        <div class="upload-progress bp3-progress-meter" style="width: 0"></div>
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
    console.error(e);
    Notification.error(i18n('File upload failed: {0}', e.toString()));
  } finally {
    dialog.close();
  }
}

async function handleClickRemoveSelected() {
  const selectedFiles = ensureAndGetSelectedFiles();
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
    });
    Notification.success(i18n('Selected files have been deleted.'));
    await pjax.request({ push: false });
  } catch (error) {
    Notification.error(error.message);
  }
}

/**
 * @param {JQuery.DragOverEvent<HTMLElement, undefined, HTMLElement, HTMLElement>} ev
 */
function handleDragOver(ev) {
  ev.preventDefault();
  // TODO display a drag-drop allowed hint
}

/**
 * @param {JQuery.DropEvent<HTMLElement, undefined, HTMLElement, HTMLElement>} ev
 */
function handleDrop(ev) {
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
  handleClickUpload(files);
}

const page = new NamedPage('home_files', () => {
  const clip = new Clipboard('.home-files .col--name', {
    text: (trigger) => {
      const filename = trigger.closest('[data-filename]').getAttribute('data-filename');
      return new URL(`/file/${UserContext._id}/${filename}`, window.location.href).toString();
    },
  });
  clip.on('success', () => {
    Notification.success(i18n('Download link copied to clipboard!'), 1000);
  });
  clip.on('error', () => {
    Notification.error(i18n('Copy failed :('));
  });
  $(document).on('click', '.home-files .col--name', (ev) => ev.preventDefault());
  $(document).on('click', '[name="upload_file"]', () => handleClickUpload());
  $(document).on('click', '[name="remove_selected"]', () => handleClickRemoveSelected());
  $(document).on('dragover', '.home-files', (ev) => handleDragOver(ev));
  $(document).on('drop', '.home-files', (ev) => handleDrop(ev));
});

export default page;
