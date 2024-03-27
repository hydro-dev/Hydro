import $ from 'jquery';
import _ from 'lodash';
import { ConfirmDialog } from 'vj/components/dialog/index';
import Notification from 'vj/components/notification';
import uploadFiles from 'vj/components/upload';
import { NamedPage } from 'vj/misc/Page';
import {
  i18n, pjax, request, tpl,
} from 'vj/utils';

function ensureAndGetSelectedFiles() {
  const files = _.map(
    $('.files tbody [data-checkbox-group="files"]:checked'),
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
  await uploadFiles('', files, { pjax: true });
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
  if (!$('[name="upload_file"]').length) {
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

const page = new NamedPage(['home_files', 'contest_manage', 'training_files', 'homework_files'], () => {
  $(document).on('click', '[name="upload_file"]', () => handleClickUpload());
  $(document).on('click', '[name="remove_selected"]', () => handleClickRemoveSelected());
  $(document).on('dragover', '.files', (ev) => handleDragOver(ev));
  $(document).on('drop', '.files', (ev) => handleDrop(ev));
});

export default page;
