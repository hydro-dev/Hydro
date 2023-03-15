import { Icon, TreeNode } from '@blueprintjs/core';
import { normalizeSubtasks, readSubtasksFromFiles } from '@hydrooj/utils/lib/common';
import { TestCaseConfig } from 'hydrooj';
import { isEqual } from 'lodash';
import React from 'react';
import { DndProvider, useDrop } from 'react-dnd';
import { HTML5Backend } from 'react-dnd-html5-backend';
import { useDispatch, useSelector, useStore } from 'react-redux';
import { RootState } from './reducer';
import { AddTestcase } from './tree/AddTestcase';
import { SelectionManager } from './tree/SelectionManager';
import { GlobalSettings, SubtaskSettings } from './tree/SubtaskSettings';

interface TestcasesDndItem {
  cases: TestCaseConfig[];
  subtaskId: number;
}

export function SubtaskNode(props: { subtaskId: number }) {
  const { subtaskId } = props;
  const subtaskIds = useSelector((s: RootState) => Object.values(s.config?.subtasks || []).map((i) => i.id), isEqual);
  const clen = useSelector((state: RootState) => (subtaskId === -1
    ? state.config.__cases.length
    : state.config.subtasks.find((i) => i.id === subtaskId).cases?.length || 0));
  const time = useSelector((s: RootState) => s.config?.time);
  const memory = useSelector((s: RootState) => s.config?.memory);
  const dispatch = useDispatch();
  const [expand, setExpand] = React.useState(true);
  const [, drop] = useDrop<TestcasesDndItem>(() => ({
    accept: 'cases',
    canDrop(item) {
      return item.subtaskId !== subtaskId;
    },
    drop(item) {
      dispatch({
        type: 'problemconfig/moveTestcases',
        payload: {
          target: subtaskId,
          source: item.subtaskId,
          cases: item.cases,
        },
      });
    },
  }));

  return (
    <li className="bp4-tree-node bp4-tree-node-expanded">
      {subtaskId !== -1 && <div className="bp4-tree-node-content" onClick={() => setExpand((e) => !e)}>
        <Icon icon={expand ? 'folder-open' : 'folder-close'} />&nbsp;
        <span className="bp4-tree-node-label">Subtask {subtaskId}</span>
        <span className="bp4-tree-node-secondary-label">
          <Icon icon="trash"></Icon>
        </span>
      </div>}
      <ul className="bp4-tree-node-list" ref={drop}>
        {subtaskId !== -1 && <SubtaskSettings subtaskId={subtaskId} time={time} memory={memory} />}
        {expand
          ? <SelectionManager subtaskId={subtaskId} subtaskIds={subtaskIds} />
          : <TreeNode
            depth={0}
            id={`s${subtaskId}`}
            onClick={() => setExpand(false)}
            icon="layers"
            label={<>&nbsp;{clen} testcases.</>}
            path={[0]}
          />}
        {!clen && (
          <li className="bp4-tree-node">
            <div className="bp4-tree-node-content">
              <span className="bp4-tree-node-caret-none bp4-icon-standard"></span>
              <span className="bp4-tree-node-label">{subtaskId === -1
                ? 'No testcase here'
                : 'Drag and drop testcases here:'}</span>
            </div>
          </li>
        )}
      </ul>
    </li>
  );
}

export function SubtaskConfigTree() {
  const ids = useSelector((s: RootState) => Object.values(s.config?.subtasks || []).map((i) => i.id), isEqual);
  const dispatch = useDispatch();
  const store = useStore<RootState>();
  function autoConfigure() {
    const state = store.getState();
    const subtasks = readSubtasksFromFiles(state.testdata, state.config);
    dispatch({
      type: 'CONFIG_AUTOCASES_UPDATE',
      subtasks: normalizeSubtasks(subtasks, (i) => i, state.config.time, state.config.memory, true),
    });
  }
  return (
    <div className="bp4-tree">
      <ul className="bp4-tree-node-list bp4-tree-root">
        <li
          className="bp4-tree-node"
          onClick={autoConfigure}
        >
          <div className="bp4-tree-node-content bp4-tree-node-content-0">
            <Icon icon="clean" />&nbsp;
            <span className="bp4-tree-node-label">Auto Configure</span>
          </div>
        </li>
        <GlobalSettings />
        {ids.map((id) => <SubtaskNode key={id} subtaskId={id} />)}
        <li
          className="bp4-tree-node"
          onClick={() => dispatch({ type: 'CONFIG_SUBTASK_UPDATE', id: 0, key: 'add' })}
        >
          <div className="bp4-tree-node-content bp4-tree-node-content-0">
            <Icon icon="folder-new" />&nbsp;
            <span className="bp4-tree-node-label">Add New Subtask</span>
          </div>
        </li>
      </ul>
    </div>
  );
}

export function ProblemConfigTree() {
  return (
    <DndProvider backend={HTML5Backend}>
      <div className="row">
        <div className="medium-6 columns">
          <SubtaskConfigTree />
        </div>
        <div className="medium-6 columns">
          <div className="bp4-tree">
            <ul className="bp4-tree-node-list bp4-tree-root">
              <AddTestcase />
              <SubtaskNode subtaskId={-1} />
            </ul>
          </div>
        </div>
      </div>
    </DndProvider>
  );
}
