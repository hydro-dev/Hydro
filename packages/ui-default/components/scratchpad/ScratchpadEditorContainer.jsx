import React from 'react';
import { connect } from 'react-redux';

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
    const { load } = await import('vj/components/monaco/loader');
    const { monaco, registerAction, customOptions } = await load([language]);
    this.model = monaco.editor.createModel(value, language, monaco.Uri.parse(`file:///${UiContext.pdoc.pid || UiContext.pdoc.docId}.${language}`));
    if (this.containerElement) {
      /** @type {monaco.editor.IStandaloneEditorConstructionOptions} */
      const config = {
        theme: 'vs-light',
        ...customOptions,
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
            this.props.handleUpdateCode(this.editor.getValue(), event);
          }
        }),
      );
    }
  }

  async componentDidUpdate(prevProps) {
    const {
      value, language, mainSize, recordSize, pretestSize,
    } = this.props;
    const { editor, model } = this;
    if (this.props.value != null && this.props.value !== model.getValue()) {
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
    const { load } = await import('vj/components/monaco/loader');
    const { monaco } = await load([language]);
    if (prevProps.language !== language) {
      monaco.editor.setModelLanguage(model, language);
      editor.updateOptions({ mode: language });
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
