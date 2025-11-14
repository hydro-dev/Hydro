import $ from 'jquery';
import React from 'react';
import ReactDOM from 'react-dom/client';
import { ActionDialog, confirm, prompt } from 'vj/components/dialog/index';
import Notification from 'vj/components/notification';
import uploadFiles from 'vj/components/upload';
import { NamedPage } from 'vj/misc/Page';
import {
  i18n, pjax, request, tpl,
} from 'vj/utils';

let endpoint = '';

const getUrl = (type: string, sidebar: boolean) => {
  let url = endpoint;
  const search = new URLSearchParams();
  if (type) search.append('d', type);
  if (sidebar) search.append('sidebar', 'true');
  if (search.size) url += `?${search.toString()}`;
  return url;
};

const extractArgsFromEvent = (ev) => {
  return {
    file: $(ev.currentTarget).parent().parent().attr('data-filename'),
    type: $(ev.target).closest('[data-type]').attr('data-type') || '',
    sidebar: !!$(ev.target).closest('[data-sidebar]').length,
  };
};

function ensureAndGetSelectedFiles(type = '') {
  const allChecked = $(`.files tbody [data-checkbox-group="${type || 'files'}"]:checked`);
  const files = allChecked.get().map((i) => $(i).closest('tr').attr('data-filename'));
  if (files.length === 0) {
    Notification.error(i18n('Please select at least one file to perform this operation.'));
    return null;
  }
  return files;
}

async function handleClickUpload(
  ev: JQuery.ClickEvent<Document, undefined, HTMLElement, HTMLElement> | JQuery.DropEvent<Document, undefined, HTMLElement, HTMLElement>,
  files?: File[] | FileList,
) {
  const { type, sidebar } = extractArgsFromEvent(ev);
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
  await uploadFiles(endpoint, files, { pjax: true, type, sidebar });
}

async function handleClickRename(ev) {
  const { file, type, sidebar } = extractArgsFromEvent(ev);
  const res = await prompt(i18n('Enter a new name for the file: '), {
    name: {
      type: 'text',
      required: true,
      label: i18n('New Filename'),
    },
  });
  if (!res?.name) return;
  try {
    await request.post(endpoint, {
      operation: 'rename_files',
      files: [file],
      newNames: [res.name],
      type,
    });
    Notification.success(i18n('File has been renamed.'));
    await pjax.request({ url: getUrl(type, sidebar), push: false });
  } catch (error) {
    Notification.error(error.message);
  }
}

async function handleClickRenameSelected(ev) {
  const { type, sidebar } = extractArgsFromEvent(ev);
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
    const [prism, setPrism] = React.useState(null);

    React.useEffect(() => {
      const load = import('../components/highlighter/prismjs');
      load.then(({ default: p }) => {
        setPrism(p.Prism);
      }).catch(() => { });
    }, []);

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
    }, [original, replace, prefix, suffix, prism]);

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
        request.post(endpoint, {
          operation: 'rename_files',
          files: selectedFiles,
          newNames,
          type,
        }).then(() => {
          Notification.success(i18n('Selected files have been renamed.'));
          pjax.request({ url: getUrl(type, sidebar), push: false });
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

async function handleClickRemove(ev) {
  const { file, type, sidebar } = extractArgsFromEvent(ev);
  if (!(await confirm(i18n('Confirm to delete the file?')))) return;
  try {
    await request.post(endpoint, {
      operation: 'delete_files',
      files: [file],
      type,
    });
    Notification.success(i18n('File has been deleted.'));
    await pjax.request({ url: getUrl(type, sidebar), push: false });
  } catch (error) {
    Notification.error(error.message);
  }
}

async function handleClickRemoveSelected(ev: JQuery.ClickEvent<Document, undefined, HTMLElement, HTMLElement>) {
  const { type, sidebar } = extractArgsFromEvent(ev);
  const selectedFiles = ensureAndGetSelectedFiles(type);
  if (selectedFiles === null) return;
  if (!(await confirm(i18n('Confirm to delete the selected files?')))) return;
  try {
    await request.post(endpoint, {
      operation: 'delete_files',
      files: selectedFiles,
      type,
    });
    Notification.success(i18n('Selected files have been deleted.'));
    await pjax.request({ url: getUrl(type, sidebar), push: false });
  } catch (error) {
    Notification.error(error.message);
  }
}

function handleDragOver(ev: JQuery.DragOverEvent<Document, undefined, HTMLElement, HTMLElement>) {
  ev.preventDefault();
  // TODO display a drag-drop allowed hint
}

function handleDrop(e: JQuery.DropEvent<Document, undefined, HTMLElement, HTMLElement>) {
  e.preventDefault();
  if (!$('[name="upload_file"]').length) {
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
  handleClickUpload(e, files);
}

const page = new NamedPage([
  'problem_config', 'problem_files', 'problem_edit', 'contest_edit', 'contest_manage',
  'home_files', 'training_files', 'homework_files',
], (pageName) => {
  if (pageName === 'problem_config' || pageName === 'problem_edit') endpoint = './files';
  $(document).on('click', '[name="file_rename"]', (ev) => handleClickRename(ev));
  $(document).on('click', '[name="file_remove"]', (ev) => handleClickRemove(ev));
  $(document).on('click', '[name="upload_file"]', (ev) => handleClickUpload(ev));
  $(document).on('click', '[name="rename_selected"]', (ev) => handleClickRenameSelected(ev));
  $(document).on('click', '[name="remove_selected"]', (ev) => handleClickRemoveSelected(ev));
  $(document).on('dragover', '.files', (ev) => handleDragOver(ev));
  $(document).on('drop', '.files', (ev) => handleDrop(ev));
});

export default page;
