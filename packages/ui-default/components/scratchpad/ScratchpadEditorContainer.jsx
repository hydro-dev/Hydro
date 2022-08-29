import React from 'react';
import { connect } from 'react-redux';
import { load } from 'vj/components/monaco/loader';

const mapStateToProps = (state) => ({
  value: state.editor.code,
  language: window.LANGS[state.editor.lang]?.monaco,
  mainSize: state.ui.main.size,
  pretestSize: state.ui.pretest.size,
  recordSize: state.ui.records.size,
});
const mapDispatchToProps = (dispatch) => ({
  handleUpdateCode: (code) => {
    dispatch({
      type: 'SCRATCHPAD_EDITOR_UPDATE_CODE',
      payload: code,
    });
  },
});

export default connect(mapStateToProps, mapDispatchToProps)(class MonacoEditor extends React.PureComponent {
  disposable = [];

  async componentDidMount() {
    const value = this.props.value || '';
    const { language } = this.props;
    const { monaco, registerAction, customOptions } = await load([language]);
    const uri = monaco.Uri.parse(`hydro://${UiContext.pdoc.pid || UiContext.pdoc.docId}.${language}`);
    this.model = monaco.editor.createModel(value, language, uri);
    if (this.containerElement) {
      /** @type {monaco.editor.IStandaloneEditorConstructionOptions} */
      const config = {
        theme: 'vs-light',
        ...customOptions,
        fontFamily: UserContext.codeFontFamily,
        lineNumbers: true,
        glyphMargin: true,
        lightbulb: { enabled: true },
        model: this.model,
      };
      this.editor = monaco.editor.create(this.containerElement, config);
      registerAction(this.editor, this.model);
      this.disposable.push(
        this.editor.onDidChangeModelContent((event) => {
          if (!this.__prevent_trigger_change_event) {
            this.props.handleUpdateCode(this.editor.getValue({ lineEnding: '\n', preserveBOM: false }), event);
          }
        }),
      );
      window.editor = this.editor;
      window.monaco = monaco;
      window.Hydro.bus.emit('scratchpadEditorCreate', this.editor, monaco);
    }
  }

  async componentDidUpdate(prevProps) {
    const {
      value, language, mainSize, recordSize, pretestSize,
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
            text: value,
          },
        ],
      );
      editor.pushUndoStop();
      this.__prevent_trigger_change_event = false;
    }
    if (model && editor && prevProps.language !== language) {
      const val = model.getValue(LF, false);
      model.dispose();
      const uri = monaco.Uri.parse(`hydro://${UiContext.pdoc.pid || UiContext.pdoc.docId}.${language}`);
      this.model = monaco.editor.createModel(val, language, uri);
      editor.setModel(this.model);
    }
    if (editor) {
      if (prevProps.mainSize !== mainSize
        || prevProps.recordSize !== recordSize
        || prevProps.pretestSize !== pretestSize) editor.layout();
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
