import React from 'react';
import { connect } from 'react-redux';
import MonacoEditor from 'react-monaco-editor';

import * as languageEnum from 'vj/constant/language';

const getOptions = (lang) => ({
  lineNumbers: true,
  mode: languageEnum.LANG_MONACO_MODES[lang],
});

const mapStateToProps = (state) => ({
  code: state.editor.code,
  lang: state.editor.lang,
});

const mapDispatchToProps = (dispatch) => ({
  handleUpdateCode: (code) => {
    dispatch({
      type: 'SCRATCHPAD_EDITOR_UPDATE_CODE',
      payload: code,
    });
  },
});

@connect(mapStateToProps, mapDispatchToProps)
export default class ScratchpadEditorContainer extends React.PureComponent {
  render() {
    return (
      <MonacoEditor
        language={languageEnum.LANG_MONACO_MODES[this.props.lang]}
        theme="vs-dark"
        class="ScratchpadMonacoEditor"
        value={this.props.code}
        options={getOptions(this.props.lang)}
        ref="editor"
        onChange={(code) => this.props.handleUpdateCode(code)}
      />
    );
  }
}
