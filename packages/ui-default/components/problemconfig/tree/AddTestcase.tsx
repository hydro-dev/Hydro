import {
  Button, ControlGroup, Dialog, DialogBody, DialogFooter, Icon, InputGroup,
} from '@blueprintjs/core';
import { readSubtasksFromFiles } from '@hydrooj/utils/lib/common';
import React, { useEffect } from 'react';
import { useSelector, useStore } from 'react-redux';
import { RootState } from '../reducer';

export function AddTestcase() {
  const [open, setOpen] = React.useState(false);
  const [input, setInput] = React.useState('');
  const [output, setOutput] = React.useState('');
  const [valid, setValid] = React.useState(false);
  const testdata = useSelector((state: RootState) => state.testdata);
  const store = useStore<RootState>();

  useEffect(() => {
    setValid(testdata.find((i) => i.name === input) && testdata.find((i) => i.name === output));
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
      onClick={() => setOpen(true)}
    >
      <div className="bp4-tree-node-content bp4-tree-node-content-0">
        <Icon icon="clean" />&nbsp;
        <span className="bp4-tree-node-label">Add testcase</span>
      </div>
    </li>
    <Dialog title="Add testcasse" icon="cog" minimal isOpen={open} onClose={() => setOpen(false)}>
      <DialogBody>
        <ControlGroup fill={true} vertical={false}>
          {/* TODO: autocomplete */}
          <InputGroup
            leftElement={<Icon icon="import" />}
            onChange={(e) => setInput(e.target.value)}
            placeholder="Input"
            value={input || ''}
          />
          <InputGroup
            leftElement={<Icon icon="export" />}
            onChange={(e) => setOutput(e.target.value)}
            placeholder="Output"
            value={output || ''}
          />
        </ControlGroup>
      </DialogBody>
      <DialogFooter actions={<Button onClick={onConfirm} disabled={!valid} intent="primary" text="Save" />} />
    </Dialog>
  </>);
}
