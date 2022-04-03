import React from 'react';
import type { editor } from 'monaco-editor';
import { connect } from 'react-redux';
import { load } from 'vj/components/monaco/loader';
import yaml from 'js-yaml';

const mapStateToProps = (state) => ({
  config: state.config,
});
const mapDispatchToProps = (dispatch) => ({
  handleUpdateCode: (code) => {
    dispatch({
      type: 'CONFIG_CODE_UPDATE',
      payload: code,
    });
  },
});

interface Props {
  config: object;
  handleUpdateCode: Function;
}

export default connect(mapStateToProps, mapDispatchToProps)(class MonacoEditor extends React.PureComponent<Props> {
  disposable = [];
  containerElement: HTMLElement;

  editor: editor.IStandaloneCodeEditor;
  model: editor.ITextModel;

  async componentDidMount() {
    const { monaco, registerAction } = await load(['yaml']);
    const uri = monaco.Uri.parse('hydro://problem/file/config.yaml');
    this.model = monaco.editor.createModel(yaml.dump(this.props.config), 'yaml', uri);
    this.editor = monaco.editor.create(this.containerElement, {
      theme: 'vs-light',
      lineNumbers: 'off',
      glyphMargin: true,
      lightbulb: { enabled: true },
      model: this.model,
    });
    registerAction(this.editor, this.model);
    this.disposable.push(
      this.editor.onDidChangeModelContent((event) => {
        this.props.handleUpdateCode(this.editor.getValue({ lineEnding: '\n', preserveBOM: false }), event);
      }),
    );
    // @ts-ignore
    window.editor = this.editor;
    // @ts-ignore
    window.monaco = monaco;
  }

  componentDidUpdate(prevProps) {
    if (yaml.dump(prevProps.config) !== yaml.dump(this.props.config)) {
      this.model?.pushEditOperations(
        [],
        [
          {
            range: this.model.getFullModelRange(),
            text: yaml.dump(this.props.config),
          },
        ],
        undefined,
      );
    }
  }

  componentWillUnmount() {
    if (this.model) this.model.dispose();
    if (this.editor) this.editor.dispose();
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
          minHeight: '500px',
          height: '100%',
          width: '100%',
        }}
        className="ConfigMonacoEditor"
      >
      </div>
    );
  }
});
