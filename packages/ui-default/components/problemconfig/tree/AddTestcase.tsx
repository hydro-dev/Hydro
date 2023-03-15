import {
  Button, Dialog, DialogBody, DialogFooter, Icon,
} from '@blueprintjs/core';
import { readSubtasksFromFiles } from '@hydrooj/utils/lib/common';
import React, { useEffect, useRef } from 'react';
import { useSelector, useStore } from 'react-redux';
import FileSelectAutoComplete from '../../autocomplete/components/FileSelectAutoComplete';
import { RootState } from '../reducer';

export function AddTestcase() {
  const [open, setOpen] = React.useState(false);
  const [input, setInput] = React.useState('');
  const [output, setOutput] = React.useState('');
  const [valid, setValid] = React.useState(false);
  const testdata = useSelector((state: RootState) => state.testdata);
  const store = useStore<RootState>();
  const refInput = useRef();
  const refOutput = useRef();

  useEffect(() => {
    setValid(testdata.find((i) => i.name === input) && testdata.find((i) => i.name === output));
    if (input && !output) {
      const filename = input.substring(0, input.lastIndexOf('.'));
      let outputFile = '';
      if (testdata.find((i) => i.name === `${filename}.out`)) outputFile = `${filename}.out`;
      else if (testdata.find((i) => i.name === `${filename}.ans`)) outputFile = `${filename}.ans`;
      // @ts-ignore
      refOutput.current!.setSelectedItems([outputFile]);
      setOutput(outputFile);
    }
    if (output && !input) {
      const filename = output.substring(0, output.lastIndexOf('.'));
      if (testdata.find((i) => i.name === `${filename}.in`)) {
        // @ts-ignore
        refInput.current!.setSelectedItems([`${filename}.in`]);
        setInput(`${filename}.in`);
      }
    }
  }, [input, output]);

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
    <li
      className="bp4-tree-node"
      onClick={auto}
    >
      <div className="bp4-tree-node-content bp4-tree-node-content-0">
        <Icon icon="clean" />&nbsp;
        <span className="bp4-tree-node-label">Auto detect</span>
      </div>
    </li>
    <li
      className="bp4-tree-node"
      onClick={() => {
        setInput('');
        setOutput('');
        setOpen(true);
      }}
    >
      <div className="bp4-tree-node-content bp4-tree-node-content-0">
        <Icon icon="clean" />&nbsp;
        <span className="bp4-tree-node-label">Add testcase</span>
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
              placeholder="Input"
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
              placeholder="Output"
              value={input || ''}
            />
          </div>
        </div>
      </DialogBody>
      <DialogFooter actions={
        <Button
          className={`primary rounded button${valid ? '' : ' disabled'}`}
          onClick={onConfirm}
          disabled={!valid}
          intent="primary"
          text="Save"
        />} />
    </Dialog>
  </>);
}
