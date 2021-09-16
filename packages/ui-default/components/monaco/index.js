import * as monaco from 'monaco-editor/esm/vs/editor/editor.api';
import loadFormatter from 'vj/components/wastyle/index';
import Notification from 'vj/components/notification';
import './languages/markdown';
import './languages/typescript';
import './languages/yaml';
import './monaco.css';

export default monaco;

/** @param {import('monaco-editor').editor.IStandaloneCodeEditor} editor */
export function registerAction(editor, model, element) {
  editor.addAction({
    id: 'theme-dark',
    label: 'Use dark theme',
    run: () => monaco.editor.setTheme('vs-dark'),
  });
  editor.addAction({
    id: 'theme-light',
    label: 'Use light theme',
    run: () => monaco.editor.setTheme('vs-light'),
  });
  if (element) {
    editor.addAction({
      id: 'submit-form',
      label: 'Use light',
      keybindings: [
        monaco.KeyMod.CtrlCmd | monaco.KeyCode.Enter,
        monaco.KeyMod.WinCtrl | monaco.KeyCode.Enter,
      ],
      run: () => $(element).closest('form').submit(),
    });
  }
  editor.addCommand(monaco.KeyMod.CtrlCmd | monaco.KeyMod.Shift | monaco.KeyCode.KEY_P, () => {
    editor.getAction('editor.action.quickCommand').run();
  });
  loadFormatter().then(([loaded, format]) => {
    if (!loaded) return;
    editor.addAction({
      id: 'hydro.format',
      label: 'Format Code',
      contextMenuOrder: 0,
      contextMenuGroupId: 'operation',
      keybindings: [monaco.KeyMod.Alt | monaco.KeyMod.Shift | monaco.KeyCode.KEY_F],
      run: () => {
        if (!['cpp', 'c'].includes(model._languageIdentifier.language)) return;
        const [success, result] = format(editor.getValue(), `${UserContext.astyleOptions.trim()} mode=c`);
        if (success) editor.setValue(result);
        else Notification.warn(result);
      },
    });
    editor.addCommand(monaco.KeyMod.Alt | monaco.KeyMod.Shift | monaco.KeyCode.KEY_F, () => {
      editor.getAction('hydro.format').run();
    });
  });
}
