import { STATUS } from '@hydrooj/common';
import $ from 'jquery';
import { map } from 'lodash';
import React from 'react';
import ReactDOM from 'react-dom/client';
import FileSelectAutoComplete from 'vj/components/autocomplete/FileSelectAutoComplete';
import { ActionDialog, confirm, InfoDialog } from 'vj/components/dialog/index';
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
    const files = map(
      $(`.problem-files-${type} tbody [data-checkbox-group="${type}"]:checked`),
      (ch) => $(ch).closest('tr').attr('data-filename'),
    );
    if (files.length === 0) {
      Notification.error(i18n('Please select at least one file to perform this operation.'));
      return null;
    }
    return files;
  }

  async function handleClickUpload(type, files?) {
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
    const newName = prompt(i18n('Enter a new name for the file: '));
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

  let prism = null;
  const load = import('../components/highlighter/prismjs');
  load.then(({ default: p }) => {
    prism = p.Prism;
  }).catch(() => { });

  async function handleClickRenameSelected(type) {
    const selectedFiles = ensureAndGetSelectedFiles(type);
    if (!selectedFiles?.length) return;
    let onActionButton = (_: string) => false;

    function Rename(props) {
      const [original, setOriginal] = React.useState('');
      const [replace, setReplace] = React.useState('');
      const [prefix, setPrefix] = React.useState('');
      const [suffix, setSuffix] = React.useState('');
      const [regexValid, setRegexValid] = React.useState(true);
      const [wantNext, setWantNext] = React.useState(false);
      const [preview, setPreview] = React.useState(false);
      const [highlight, setHighlight] = React.useState(null);
      const [newNames, setNewNames] = React.useState(props.names);

      React.useEffect(() => {
        let s: string | RegExp = original;
        setRegexValid(true);
        setHighlight(null);
        if (original.length > 2 && original.startsWith('/')) {
          const availableFlags = ['g', 'i'];
          const flags = [];
          let copy = original.substring(1);
          while (availableFlags.includes(copy[copy.length - 1])) {
            flags.push(copy[copy.length - 1]);
            copy = copy.substring(0, copy.length - 1);
          }
          if (copy.endsWith('/')) {
            copy = copy.substring(0, copy.length - 1);
            flags.reverse();
            if (prism) setHighlight(`/${prism.highlight(copy, prism.languages.regex, 'RegExp')}/${flags.join('')}`);
            try {
              s = new RegExp(copy, flags.join(''));
              setRegexValid(true);
            } catch (e) {
              setRegexValid(false);
            }
          }
        }
        setNewNames(selectedFiles.map((file) => {
          if (s) file = file.replace(s, replace);
          return prefix + file + suffix;
        }));
      }, [original, replace, prefix, suffix]);

      onActionButton = (action) => {
        if (action === 'ok') {
          if (!preview) {
            if (!regexValid) return false;
            if (!original && !prefix && !suffix) {
              setWantNext(true);
              return false;
            }
            setPreview(true);
            return false;
          }
          request.post('', {
            operation: 'rename_files',
            files: selectedFiles,
            newNames,
            type,
          }).then(() => {
            Notification.success(i18n('Selected files have been renamed.'));
            pjax.request({ push: false });
          }).catch((error) => {
            Notification.error(error.message);
          });
          return true;
        }
        if (preview) {
          setPreview(false);
          return false;
        }
        return true;
      };

      const style = { fontFamily: 'var(--code-font-family)' };

      return <div className="typo" style={{ maxHeight: '60vh', overflow: 'scroll' }}>
        {!preview ? <>
          <div className="row">
            <div className="medium-6 small-6 columns">
              <h2>{i18n('Batch replacement')}</h2>
              <label>{i18n('Original content')}
                <div style={{ position: 'relative' }}>
                  <div className="textbox-container" style={{ zIndex: 1, position: 'relative' }}>
                    <input
                      className="textbox"
                      type="text"
                      style={{ ...style, ...(highlight ? { color: 'transparent', background: 'transparent', caretColor: 'black' } : {}) }}
                      value={original}
                      onChange={(e) => setOriginal(e.currentTarget.value)}
                    />
                  </div>
                  <div
                    className="textbox-container"
                    style={{
                      position: 'absolute', top: 0, left: 0, zIndex: 0,
                    }}
                  >
                    {highlight && <span
                      className="textbox"
                      style={{
                        ...style, border: 'none', display: 'inline-flex', alignItems: 'center',
                      }}
                      dangerouslySetInnerHTML={{ __html: highlight }}
                    />}
                  </div>
                </div>
              </label>
              <label>{i18n('Replace with')}
                <div className="textbox-container">
                  <input className="textbox" type="text" value={replace} onChange={(e) => setReplace(e.currentTarget.value)}></input>
                </div>
              </label>
            </div>
            <div className="medium-6 small-6 columns">
              <h2>{i18n('Add prefix/suffix')}</h2>
              <label>{i18n('Add prefix')}
                <div className="textbox-container">
                  <input className="textbox" type="text" value={prefix} onChange={(e) => setPrefix(e.currentTarget.value)}></input>
                </div>
              </label>
              <label>{i18n('Add suffix')}
                <div className="textbox-container">
                  <input className="textbox" type="text" value={suffix} onChange={(e) => setSuffix(e.currentTarget.value)}></input>
                </div>
              </label>
            </div>
          </div>
          <div className="row">
            <div className="medium-12 columns">
              <p>{!regexValid ? i18n('Invalid RegExp') : wantNext ? i18n('No changes to make.') : i18n('RegExp supported, quote with "/"')}</p>
            </div>
          </div>
        </> : <div>
          <p>{i18n('Are you sure to rename the following file?')}</p>
          <ul>
            {original && <li>Replace {original} with {replace}</li>}
            {prefix && <li>Add {prefix} as prefix</li>}
            {suffix && <li>Add {suffix} as suffix</li>}
          </ul>
          <table className="data-table rename-confirm-table">
            <colgroup>
              <col className="col--origin" />
              <col className="col--new" />
            </colgroup>
            <thead>
              <tr>
                <th className="col--origin">{i18n('Original filename(s)')}</th>
                <th className="col--new">{i18n('New filename(s)')}</th>
              </tr>
            </thead>
            <tbody>
              {selectedFiles.map((file, index) => <tr key={file}>
                <td className="col--origin">{file}</td>
                <td className="col--new">{newNames[index]}</td>
              </tr>)}
            </tbody>
          </table>
        </div>}
      </div>;
    }

    const promise = new ActionDialog({
      $body: tpl`<div id="rename_dialog"></div>`,
      width: '600px',
      onDispatch(action) {
        return onActionButton(action);
      },
    }).open();
    const root = ReactDOM.createRoot(document.getElementById('rename_dialog'));
    root.render(<Rename names={selectedFiles} />);
    await promise;
    root.unmount();
  }

  async function handleClickRemove(ev, type) {
    const file = [$(ev.currentTarget).parent().parent().attr('data-filename')];
    if (!(await confirm(i18n('Confirm to delete the file?')))) return;
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
    if (!(await confirm(i18n('Confirm to delete the selected files?')))) return;
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

  function handleDragOver(type: string, ev: JQuery.DragOverEvent<Document, undefined, HTMLElement, HTMLElement>) {
    ev.preventDefault();
    // TODO display a drag-drop allowed hint
  }

  function handleDrop(type: string, e: JQuery.DropEvent<Document, undefined, HTMLElement, HTMLElement>) {
    e.preventDefault();
    if (!$('[name="upload_testdata"]').length) {
      Notification.error(i18n("You don't have permission to upload file."));
      return;
    }
    const ev = e.originalEvent;
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
