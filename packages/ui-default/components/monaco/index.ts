import './monaco.styl';

import $ from 'jquery';
import { EditorAction, registerEditorAction } from 'monaco-editor/esm/vs/editor/browser/editorExtensions';
import * as monaco from 'monaco-editor/esm/vs/editor/editor.api';
import { IQuickInputService } from 'monaco-editor/esm/vs/platform/quickinput/common/quickInput';
import list from 'monaco-themes/themes/themelist.json';
import { nanoid } from 'nanoid';
import { i18n, request } from 'vj/utils';

export default monaco;
export const customOptions: monaco.editor.IStandaloneDiffEditorConstructionOptions = JSON.parse(localStorage.getItem('editor.config') || '{}');
export function saveCustomOptions() {
  localStorage.setItem('editor.config', JSON.stringify(customOptions));
}

const loaded = {};
async function fetchTheme(id: string, label: string) {
  if (loaded[id]) return;
  const res = await fetch(`${UiContext.cdn_prefix}monaco/themes/${label}.json`);
  const data = await res.json();
  monaco.editor.defineTheme(id, data);
  loaded[id] = true;
}
export const loadThemePromise = customOptions.theme
  ? fetchTheme(customOptions.theme, list[customOptions.theme])
  : Promise.resolve();

// 这破烂 monaco 能不能给个 typings 啊
// 我翻源码真的很累的好吧
class ChangeThemeAction extends EditorAction {
  constructor() {
    super({
      id: 'hydro.changeEditorTheme',
      label: i18n('Change Theme'),
      alias: 'Change Theme',
    });
  }

  async run(accessor, editor: monaco.editor.IStandaloneCodeEditor) {
    const items = Object.keys(list).map((key) => ({
      label: list[key],
      command: key,
    }));
    const quickInputService = accessor.get(IQuickInputService);
    const oldTheme = (editor as any)._themeService._theme;
    let focus = '';
    const selected = await quickInputService.pick(items, {
      canPickMany: false,
      async onDidFocus(item) {
        focus = item.command;
        await fetchTheme(item.command, item.label);
        if (focus === item.command) monaco.editor.setTheme(item.command);
      },
    });
    if (!selected) {
      const themeId = oldTheme.type ? `${oldTheme.base}-${oldTheme.type}` : oldTheme.id;
      return monaco.editor.setTheme(themeId);
    }
    await fetchTheme(selected.command, selected.label);
    customOptions.theme = selected.command;
    saveCustomOptions();
    return monaco.editor.setTheme(selected.command);
  }
}

registerEditorAction(ChangeThemeAction);

const pagename = document.documentElement.getAttribute('data-page');
const isProblemPage = ['problem_create', 'problem_edit'].includes(pagename);
const isProblemEdit = pagename === 'problem_edit';
function handlePasteEvent(editor: monaco.editor.IStandaloneCodeEditor) {
  window.addEventListener('paste', (ev: ClipboardEvent) => {
    if (!editor.hasTextFocus()) return;
    const selection = editor.getSelection();
    const { items } = ev.clipboardData;
    let wrapper = ['', ''];
    let ext;
    const matches = items[0].type.match(/^image\/(png|jpg|jpeg|gif)$/i);
    if (matches) {
      wrapper = ['![image](', ')'];
      [, ext] = matches;
    } else if (items[0].type === 'application/x-zip-compressed') {
      wrapper = ['[file](', ')'];
      ext = 'zip';
    }
    if (!ext) return;
    ev.preventDefault();
    ev.stopPropagation();
    const filename = `${nanoid()}.${ext}`;
    const data = new FormData();
    data.append('filename', filename);
    data.append('file', items[0].getAsFile());
    data.append('operation', 'upload_file');
    if (isProblemEdit) data.append('type', 'additional_file');
    let range: monaco.Range = null;
    editor.executeEdits('', [{
      range: new monaco.Range(selection.endLineNumber, selection.endColumn, selection.endLineNumber, selection.endColumn),
      text: `![image](${i18n('Preparing Upload...')}) `,
    }], (inverseOp) => { range = inverseOp[0].range; return null; });
    editor.setPosition(editor.getSelection().getEndPosition());

    function updateText(text: string) {
      const pos = editor.getSelection();
      const rangeBefore = range;
      editor.executeEdits('', [{ range, text: `${wrapper[0]}${text}${wrapper[1]} ` }], (inverseOp) => {
        range = inverseOp[0].range;
        if (pos.endLineNumber !== pos.startLineNumber || pos.endLineNumber !== range.endLineNumber) return null;
        const delta = rangeBefore.endColumn - range.endColumn;
        editor.setPosition(new monaco.Position(pos.endLineNumber, pos.endColumn - delta));
        return null;
      });
    }
    let progress = 0;
    request.postFile(isProblemEdit ? './files' : '/file', data, {
      xhr() {
        const xhr = new XMLHttpRequest();
        xhr.upload.addEventListener('loadstart', () => updateText(i18n('Uploading...')));
        xhr.upload.addEventListener('progress', (e) => {
          if (!e.lengthComputable) return;
          const percentComplete = Math.round((e.loaded / e.total) * 100);
          if (percentComplete === progress) return;
          progress = percentComplete;
          updateText(`${i18n('Uploading...')} ${percentComplete}%`);
        }, false);
        return xhr;
      },
    })
      .then(() => updateText(`${isProblemPage ? 'file://' : `/file/${UserContext._id}/`}${filename}`))
      .catch((e) => {
        console.error(e);
        updateText(`${i18n('Upload Failed')}: ${e.message}`);
      });
  }, { capture: true });
}

export function registerAction(
  editor: monaco.editor.IStandaloneCodeEditor,
  model: monaco.editor.IModel,
  element?,
) {
  if (element) {
    editor.addAction({
      id: 'hydro.submitForm',
      label: 'Submit',
      keybindings: [
        monaco.KeyMod.CtrlCmd | monaco.KeyCode.Enter,
        monaco.KeyMod.WinCtrl | monaco.KeyCode.Enter,
      ],
      run: () => {
        const form = $(element).closest('form');
        if (form.find('[data-default-submit]').length) form.find('[data-default-submit]').click();
        else form.submit();
      },
    });
  }
  editor.addCommand(monaco.KeyMod.CtrlCmd | monaco.KeyMod.Shift | monaco.KeyCode.KeyP, () => {
    editor.getAction('editor.action.quickCommand').run();
  });
  editor.addCommand(monaco.KeyMod.Alt | monaco.KeyMod.Shift | monaco.KeyCode.KeyF, () => {
    const action = editor.getAction('editor.action.format') || editor.getAction('editor.action.formatDocument');
    if (action) action.run();
  });
  editor.onDidChangeConfiguration(() => {
    const current = editor.getOption(monaco.editor.EditorOptions.fontSize.id);
    customOptions.fontSize = current;
    saveCustomOptions();
  });
  if (model.getLanguageId() === 'markdown') {
    const suggestWidget = (editor.getContribution('editor.contrib.suggestController') as any).widget?.value;
    if (suggestWidget?._setDetailsVisible) suggestWidget._setDetailsVisible(true);
    handlePasteEvent(editor);
  }
  if (!customOptions.theme) return null;
  return loadThemePromise.then(() => editor.updateOptions({ theme: customOptions.theme }));
}
