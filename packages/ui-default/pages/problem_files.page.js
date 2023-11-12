import $ from 'jquery';
import _ from 'lodash';
import { ActionDialog, ConfirmDialog } from 'vj/components/dialog/index';
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

  async function handleClickRename(ev, type) {
    const file = [$(ev.currentTarget).parent().parent().attr('data-filename')];
    // eslint-disable-next-line no-alert
    const newName = prompt('Enter a new name for the file: ');
    if (!newName) return;
    try {
      await request.post('./files', {
        operation: 'rename_files',
        files: file,
        newNames: [newName],
        type,
      });
      Notification.success(i18n('File have been renamed.'));
      await pjax.request({ push: false });
    } catch (error) {
      Notification.error(error.message);
    }
  }

  async function handleClickRenameSelected(type) {
    const selectedFiles = ensureAndGetSelectedFiles(type);
    if (selectedFiles === null) return;
    const rename = await new ActionDialog({
      $body: tpl`
        <div class="typo"><div class="row">
          <div class="medium-6 small-6 columns">
            <h2>${i18n('Batch Replacement')}</h2>
            <label>${i18n('Original Content')}  
              <div class="textbox-container">
                <input class="textbox" type="text" name="original_content" data-autofocus></input>
              </div>
            </label>
            <label>${i18n('Replace with')}  
              <div class="textbox-container">
                <input class="textbox" type="text" name="replace_content"></input>
              </div>
            </label>
          </div>
          <div class="medium-6 small-6 columns">
            <h2>${i18n('Batch Add Prefix and Suffix')}</h2>
            <label>${i18n('Add Prefix')}  
              <div class="textbox-container">
                <input class="textbox" type="text" name="add_prefix"></input>
              </div>
            </label>
            <label>${i18n('Add Suffix')}  
              <div class="textbox-container">
                <input class="textbox" type="text" name="add_suffix"></input>
              </div>
            </label>
          </div>
        </div></div>
      `,
      width: '600px',
      onDispatch(action) {
        const inputs = ['original_content', 'add_prefix', 'add_suffix'];
        if (action === 'ok' && inputs.every((input) => !$(`[name="${input}"]`).val().length)) {
          $('[name="original_content"]').focus();
          return false;
        }
        return true;
      },
    }).open();
    if (rename !== 'ok') return;
    const original = $('[name="original_content"]').val();
    const replace = $('[name="replace_content"]').val();
    const prefix = $('[name="add_prefix"]').val();
    const suffix = $('[name="add_suffix"]').val();
    const newNames = selectedFiles.map((file) => {
      if (original) file = file.replace(original, replace);
      return prefix + file + suffix;
    });
    const confirm = new ConfirmDialog({
      $body: tpl`
        <p>${i18n('Are you sure to make the following changes to the file name?')}</p>
        <table class="data-table rename-confirm-table">
          <colgroup>
            <col class="col--origin">
            <col class="col--new">
          </colgroup>
          <thead>
            <tr>
              <th class="col--origin">${i18n('Original Filenames')}</th>
              <th class="col--new">${i18n('New Filenames')}</th>
            </tr>
          </thead>
          <tbody></tbody>
        </table>
      `,
      width: '500px',
    }).open();
    selectedFiles.forEach((file, index) => {
      $(tpl`
        <tr>
          <td class="col--origin">${file}</td>
          <td class="col--new">${newNames[index]}</td>
        </tr>
      `).appendTo($('.rename-confirm-table>tbody'));
    });
    if (await confirm !== 'yes') return;
    try {
      await request.post('', {
        operation: 'rename_files',
        files: selectedFiles,
        newNames,
        type,
      });
      Notification.success(i18n('Selected files have been renamed.'));
      await pjax.request({ push: false });
    } catch (error) {
      Notification.error(error.message);
    }
  }

  async function handleClickRemove(ev, type) {
    const file = [$(ev.currentTarget).parent().parent().attr('data-filename')];
    const action = await new ConfirmDialog({
      $body: tpl.typoMsg(i18n('Confirm to delete the file?')),
    }).open();
    if (action !== 'yes') return;
    try {
      await request.post('./files', {
        operation: 'delete_files',
        files: file,
        type,
      });
      Notification.success(i18n('File have been deleted.'));
      await pjax.request({ push: false });
    } catch (error) {
      Notification.error(error.message);
    }
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
    $(document).on('click', '[name="testdata__rename"]', (ev) => handleClickRename(ev, 'testdata'));
    $(document).on('click', '[name="additional_file__rename"]', (ev) => handleClickRename(ev, 'additional_file'));
    $(document).on('click', '[name="rename_selected_testdata"]', () => handleClickRenameSelected('testdata'));
    $(document).on('click', '[name="rename_selected_file"]', () => handleClickRenameSelected('additional_file'));
    $(document).on('click', '[name="testdata__delete"]', (ev) => handleClickRemove(ev, 'testdata'));
    $(document).on('click', '[name="additional_file__delete"]', (ev) => handleClickRemove(ev, 'additional_file'));
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
