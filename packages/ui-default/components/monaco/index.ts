import * as monaco from 'monaco-editor/esm/vs/editor/editor.api';
import { EditorAction, registerEditorAction } from 'monaco-editor/esm/vs/editor/browser/editorExtensions';
import { IQuickInputService } from 'monaco-editor/esm/vs/platform/quickinput/common/quickInput';
import list from 'monaco-themes/themes/themelist.json';
import i18n from 'vj/utils/i18n';
import './monaco.css';

export default monaco;
export const customOptions: monaco.editor.IStandaloneDiffEditorConstructionOptions = JSON.parse(localStorage.getItem('editor.config') || '{}');

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
      alias: i18n('Change Theme'),
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
    return monaco.editor.setTheme(selected.command);
  }
}

registerEditorAction(ChangeThemeAction);

export function registerAction(
  editor: monaco.editor.IStandaloneCodeEditor,
  model: monaco.editor.IModel,
  element,
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
        $(element).closest('form').submit();
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
    localStorage.setItem('editor.config', JSON.stringify(customOptions));
  });
}
