import { readSubtasksFromFiles } from '@hydrooj/common';
import {
  Button, Classes, Dialog, DialogBody, DialogFooter, Icon,
} from '@blueprintjs/core';
import React, { useEffect, useRef } from 'react';
import { useSelector, useStore } from 'react-redux';
import { i18n } from 'vj/utils';
import FileSelectAutoComplete from '../../autocomplete/components/FileSelectAutoComplete';
import { RootState } from '../reducer';

export function AddTestcase() {
  const [open, setOpen] = React.useState(false);
  const [input, setInput] = React.useState('');
  const [output, setOutput] = React.useState('');
  const [valid, setValid] = React.useState(false);
  const [autoInput, setAutoInput] = React.useState(true);
  const [autoOutput, setAutoOutput] = React.useState(true);
  const testdata = useSelector((state: RootState) => state.testdata);
  const store = useStore<RootState>();
  const refInput = useRef(null);
  const refOutput = useRef(null);

  useEffect(() => {
    const inputValid = testdata.find((i) => i.name === input);
    if (input) setAutoInput(false);
    else setAutoInput(true);
    setValid(inputValid);
    if (inputValid && autoOutput) {
      const filename = input.substring(0, input.lastIndexOf('.'));
      let outputFile = '';
      if (testdata.find((i) => i.name === `${filename}.out`)) outputFile = `${filename}.out`;
      else if (testdata.find((i) => i.name === `${filename}.ans`)) outputFile = `${filename}.ans`;
      if (outputFile) {
        // @ts-ignore
        refOutput.current!.setSelectedItems([outputFile]);
        setOutput(outputFile);
        setAutoOutput(true);
      }
    }
  }, [input]);

  useEffect(() => {
    const outputValid = testdata.find((i) => i.name === output);
    if (output) setAutoOutput(false);
    else setAutoOutput(true);
    setValid(outputValid);
    if (outputValid && autoInput) {
      const filename = output.substring(0, output.lastIndexOf('.'));
      if (testdata.find((i) => i.name === `${filename}.in`)) {
        // @ts-ignore
        refInput.current!.setSelectedItems([`${filename}.in`]);
        setInput(`${filename}.in`);
        setAutoInput(true);
      }
    }
  }, [output]);

  function onConfirm() {
    store.dispatch({
      type: 'problemconfig/addTestcases',
      cases: [{ input, output }],
    });
    setOpen(false);
  }

  function auto() {
    const state = store.getState();
    const subtasks = readSubtasksFromFiles(state.testdata.map((i) => i.name), {});
    const current = state.config.subtasks.flatMap((i) => i.cases).concat(state.config.__cases);
    const pending = [];
    for (const c of subtasks.flatMap((s) => s.cases)) {
      if (!current.find((i) => i.input === c.input && i.output === c.output)) {
        pending.push({
          input: c.input,
          output: c.output,
        });
      }
    }
    store.dispatch({
      type: 'problemconfig/addTestcases',
      cases: pending,
    });
  }

  return (<>
    <li className={Classes.TREE_NODE} onClick={auto}>
      <div className={`${Classes.TREE_NODE_CONTENT} ${Classes.TREE_NODE_CONTENT}-0`}>
        <Icon icon="clean" />&nbsp;
        <span className={Classes.TREE_NODE_LABEL}>{i18n('Auto detect')}</span>
      </div>
    </li>
    <li
      className={Classes.TREE_NODE}
      onClick={() => {
        setInput('');
        setOutput('');
        setAutoInput(true);
        setAutoOutput(true);
        setOpen(true);
      }}
    >
      <div className={`${Classes.TREE_NODE_CONTENT} ${Classes.TREE_NODE_CONTENT}-0`}>
        <Icon icon="clean" />&nbsp;
        <span className={Classes.TREE_NODE_LABEL}>{i18n('Add testcase')}</span>
      </div>
    </li>
    <Dialog title="Add testcase" icon="cog" isOpen={open} onClose={() => setOpen(false)}>
      <DialogBody>
        <div className="row">
          <div className="columns medium-6">
            <FileSelectAutoComplete
              ref={refInput}
              data={testdata}
              label="Input"
              width="100%"
              onChange={(e) => setInput(e)}
              placeholder={i18n('Input')}
              value={input || ''}
            />
          </div>
          <div className="columns medium-6">
            <FileSelectAutoComplete
              ref={refOutput}
              data={testdata}
              label="Output"
              width="100%"
              onChange={(e) => setOutput(e)}
              placeholder={i18n('Output')}
              value={input || ''}
            />
          </div>
        </div>
      </DialogBody>
      <DialogFooter
        actions={<Button
          className={`primary rounded button${valid ? '' : ' disabled'}`}
          onClick={onConfirm}
          disabled={!valid}
          intent="primary"
          text="Save"
        />}
      />
    </Dialog>
  </>);
}
