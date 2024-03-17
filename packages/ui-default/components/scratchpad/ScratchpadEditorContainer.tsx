import type * as monaco from 'monaco-editor';
import React from 'react';
import { connect } from 'react-redux';
import { load } from 'vj/components/monaco/loader';
import { ctx } from 'vj/context';

interface ScratchpadOptions {
  value?: string;
  language?: string;
  handleUpdateCode?: (str: string, event: monaco.editor.IModelContentChangedEvent) => void;
  settings?: any;
  pendingCommand?: string;
  commandDone?: () => void;
}

export default connect((state: any) => ({
  value: state.editor.code,
  language: window.LANGS[state.editor.lang]?.monaco,
  settings: state.ui.settings.config,
  pendingCommand: state.ui.pendingCommand,
}), (dispatch) => ({
  handleUpdateCode: (code: string) => {
    dispatch({
      type: 'SCRATCHPAD_EDITOR_UPDATE_CODE',
      payload: code,
    });
  },
  commandDone: () => {
    dispatch({
      type: 'SCRATCHPAD_TRIGGER_EDITOR_COMMAND',
      payload: { command: '' },
    });
  },
}))(class MonacoEditor extends React.PureComponent<ScratchpadOptions> {
  disposable: monaco.IDisposable[] = [];
  __prevent_trigger_change_event = false;
  model: monaco.editor.ITextModel;
  editor: monaco.editor.IStandaloneCodeEditor;
  containerElement: HTMLElement;

  async componentDidMount() {
    const value = this.props.value || '';
    const { language } = this.props;
    const { monaco, registerAction, customOptions } = await load([language]);
    const uri = monaco.Uri.parse(`hydro:${UiContext.pdoc.pid || UiContext.pdoc.docId}.${language}`);
    this.model = monaco.editor.getModel(uri) || monaco.editor.createModel(value, language, uri);
    if (this.containerElement) {
      const config: monaco.editor.IStandaloneEditorConstructionOptions = {
        theme: 'vs-light',
        fontFamily: UserContext.codeFontFamily,
        ...customOptions,
        lineNumbers: 'on',
        glyphMargin: true,
        lightbulb: { enabled: monaco.editor.ShowLightbulbIconMode.On },
        model: this.model,
        fontLigatures: '',
      };
      this.editor = monaco.editor.create(this.containerElement, config);
      registerAction(this.editor, this.model);
      this.disposable.push(
        this.editor.onDidChangeModelContent((event) => {
          if (!this.__prevent_trigger_change_event) {
            this.props.handleUpdateCode?.(this.editor.getValue({ lineEnding: '\n', preserveBOM: false }), event);
          }
        }),
      );
      (window as any).editor = this.editor;
      (window as any).monaco = monaco;
      ctx.scratchpad.init(this.editor, monaco);
    }
  }

  async componentDidUpdate(prevProps) {
    const {
      value, language,
    } = this.props;
    const { monaco } = await load([language]);
    const { editor, model } = this;
    const { LF } = monaco.editor.EndOfLinePreference;
    if (model && editor && this.props.value != null && this.props.value !== model.getValue(LF, false)) {
      this.__prevent_trigger_change_event = true;
      editor.pushUndoStop();
      model.pushEditOperations(
        [],
        [
          {
            range: model.getFullModelRange(),
            text: value!,
          },
        ],
        () => null,
      );
      editor.pushUndoStop();
      this.__prevent_trigger_change_event = false;
    }
    if (model && editor && prevProps.language !== language) {
      const val = model.getValue(LF, false);
      model.dispose();
      const uri = monaco.Uri.parse(`hydro:${UiContext.pdoc.pid || UiContext.pdoc.docId}.${language}`);
      this.model = monaco.editor.getModel(uri) || monaco.editor.createModel(val, language, uri);
      editor.setModel(this.model);
    }
    if (editor && this.props.settings) {
      editor.updateOptions(this.props.settings);
    }
    if (this.props.pendingCommand) {
      editor.focus();
      editor.getAction(this.props.pendingCommand)?.run();
      this.props.commandDone();
    }
  }

  componentWillUnmount() {
    if (this.editor) this.editor.dispose();
    if (this.model) this.model.dispose();
    this.disposable.map((i) => i.dispose());
  }

  assignRef = (component) => {
    this.containerElement = component;
  };

  render() {
    return (
      <div
        ref={this.assignRef}
        style={{
          height: '100%',
          width: '100%',
        }}
        className="ScratchpadMonacoEditor"
      >
        <div className="loader-container"><div className="loader"></div></div>
      </div>
    );
  }
});
