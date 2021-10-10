import React from 'react';
import { connect } from 'react-redux';
import monaco, { registerAction } from 'vj/components/monaco/index';

const mapStateToProps = (state) => ({
  value: state.editor.code,
  language: window.LANGS[state.editor.lang]?.monaco,
  theme: 'vs-light',
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

  componentDidMount() {
    const value = this.props.value || '';
    const { language, theme } = this.props;
    this.model = monaco.editor.createModel(value, language, monaco.Uri.parse('file://model'));
    if (this.containerElement) {
      /** @type {monaco.editor.IStandaloneEditorConstructionOptions} */
      const config = {
        theme,
        lineNumbers: true,
        glyphMargin: true,
        lightbulb: { enabled: true },
        model: this.model,
      };
      const fontSize = localStorage.getItem('scratchpad.editor.fontSize');
      if (fontSize && !Number.isNaN(+fontSize)) config.fontSize = +fontSize;
      this.editor = monaco.editor.create(this.containerElement, config);
      registerAction(this.editor, this.model);
      this.disposable.push(
        this.editor.onDidChangeModelContent((event) => {
          if (!this.__prevent_trigger_change_event) {
            this.props.handleUpdateCode(this.editor.getValue(), event);
          }
        }),
        this.editor.onDidChangeConfiguration(() => {
          const current = this.editor.getOptions()._values[40].fontSize;
          localStorage.setItem('scratchpad.editor.fontSize', current);
        }),
      );
    }
  }

  componentDidUpdate(prevProps) {
    const {
      value, language, theme, mainSize, recordSize, pretestSize,
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
    if (prevProps.language !== language) {
      monaco.editor.setModelLanguage(model, language);
      editor.updateOptions({ mode: language });
    }
    if (prevProps.theme !== theme) monaco.editor.setTheme(theme);
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
      />
    );
  }
});
