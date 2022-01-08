import * as monaco from 'monaco-editor/esm/vs/editor/editor.api';
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
      label: 'Submit',
      keybindings: [
        monaco.KeyMod.CtrlCmd | monaco.KeyCode.Enter,
        monaco.KeyMod.WinCtrl | monaco.KeyCode.Enter,
      ],
      run: () => $(element).closest('form').submit(),
    });
  }
  editor.addCommand(monaco.KeyMod.CtrlCmd | monaco.KeyMod.Shift | monaco.KeyCode.KeyP, () => {
    editor.getAction('editor.action.quickCommand').run();
  });
  editor.addCommand(monaco.KeyMod.Alt | monaco.KeyMod.Shift | monaco.KeyCode.KeyF, () => {
    const action = editor.getAction('editor.action.format') || editor.getAction('editor.action.formatDocument');
    if (action) action.run();
  });
}
