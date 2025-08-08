/* eslint-disable react-refresh/only-export-components */
import type { ProblemConfigFile, TestCaseConfig } from 'hydrooj/src/interface';
import { diffLines } from 'diff';
import $ from 'jquery';
import yaml from 'js-yaml';
import { isEqual } from 'lodash';
import type { editor } from 'monaco-editor';
import React from 'react';
import { connect } from 'react-redux';
import Editor from 'vj/components/editor';
import { load } from 'vj/components/monaco/loader';

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
  config: any;
  handleUpdateCode: (val: string) => void;
}

const configKey = [
  'type', 'subType', 'target', 'score', 'time',
  'memory', 'filename', 'checker_type', 'checker', 'interactor',
  'manager', 'num_processes', 'validator', 'user_extra_files', 'judge_extra_files',
  'detail', 'outputs', 'redirect', 'cases', 'subtasks',
  'langs', 'key', 'time_limit_rate', 'memory_limit_rate',
];

const subtasksKey = [
  'time', 'memory', 'score', 'if', 'id',
  'type', 'cases',
];

const casesKey = ['time', 'memory', 'input', 'output'];

export function configYamlFormat(config: ProblemConfigFile) {
  const formatConfig: ProblemConfigFile = {};
  configKey.forEach((key) => {
    if (config[key] !== undefined) {
      if (key === 'subType' && ['single', 'multi'].includes(config[key]) && config.type !== 'submit_answer') return;
      if (key === 'checker_type' && config.type !== 'default') return;
      if (key === 'checker'
        && (['default', 'strict'].includes(formatConfig.checker_type) || !formatConfig.checker_type)) return;
      if (key === 'interactor' && config.type !== 'interactive') return;
      if (key === 'subtasks') {
        formatConfig[key] = [];
        config[key].forEach((subtask) => {
          const formatSubtask: object = {};
          subtasksKey.forEach((subtaskKey) => {
            if (subtask && subtask[subtaskKey] !== undefined) {
              formatSubtask[subtaskKey] = subtask[subtaskKey];
            }
          });
          formatConfig[key].push(formatSubtask);
        });
      } else if (key === 'cases') {
        formatConfig[key] = [];
        config[key].forEach((caseItem) => {
          const formatCase: TestCaseConfig = {
            time: '1000ms', memory: '256MB', input: '', output: '',
          };
          casesKey.forEach((caseKey) => {
            if (caseItem[caseKey] !== undefined) formatCase[caseKey] = caseItem[caseKey];
            else delete formatCase[caseKey];
          });
          formatConfig[key].push(formatCase);
        });
      } else formatConfig[key] = config[key];
    }
  });
  if (formatConfig.type === 'objective') {
    Object.keys(formatConfig).filter((i) => !['type', 'answers'].includes(i)).forEach((i) => delete formatConfig[i]);
    formatConfig.answers = config.answers || {};
  }
  Object.keys(formatConfig).filter((i) => i.startsWith('__')).forEach((i) => delete formatConfig[i]);
  return formatConfig;
}

export default connect(mapStateToProps, mapDispatchToProps)(class MonacoEditor extends React.PureComponent<Props> {
  disposable = [];
  containerElement: HTMLElement;
  __preventUpdate = false;
  __preventFormat = false;

  editor: editor.IStandaloneCodeEditor;
  model: editor.ITextModel;
  vjEditor: Editor;

  async componentDidMount() {
    const { monaco } = await load(['yaml']);
    const uri = monaco.Uri.parse('hydro://problem/file/config.yaml');
    this.model = monaco.editor.createModel(yaml.dump(configYamlFormat(this.props.config), { noArrayIndent: true }), 'yaml', uri);
    this.vjEditor = Editor.getOrConstruct($(this.containerElement), {
      language: 'yaml',
      model: this.model,
      lineNumbers: 'off',
      onChange: (value: string) => {
        this.__preventUpdate = true;
        if (!this.__preventFormat) this.props.handleUpdateCode(value);
        this.__preventUpdate = false;
      },
    }) as Editor;
    this.editor = this.vjEditor.editor;
  }

  componentDidUpdate(prevProps) {
    if (this.__preventUpdate || !this.model || !this.props.config.__valid) return;
    if (yaml.dump(prevProps.config, { noArrayIndent: true }) === yaml.dump(this.props.config, { noArrayIndent: true })) return;
    const curValue = this.model.getValue();
    const pending = configYamlFormat(this.props.config);
    try {
      const curConfig = yaml.load(curValue);
      if (isEqual(curConfig, pending)) return;
    } catch { }
    this.__preventFormat = true;
    const diff = diffLines(curValue, yaml.dump(pending, { noArrayIndent: true }));
    const ops = [];
    let cursor = 1;
    for (const line of diff) {
      if (line.added) {
        let range = this.model.getFullModelRange();
        range = range.setStartPosition(cursor, 0);
        range = range.setEndPosition(cursor, 0);
        ops.push({ range, text: line.value });
      } else if (line.removed) {
        let range = this.model.getFullModelRange();
        range = range.setStartPosition(cursor, 0);
        cursor += line.count;
        range = range.setEndPosition(cursor, 0);
        ops.push({ range, text: '' });
      } else cursor += line.count;
    }
    this.model.pushEditOperations([], ops, undefined);
    this.__preventFormat = false;
  }

  componentWillUnmount() {
    if (this.vjEditor) this.vjEditor.destroy();
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
      />
    );
  }
});
