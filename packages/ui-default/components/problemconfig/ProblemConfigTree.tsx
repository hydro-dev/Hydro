import { Button, Icon, TreeNode } from '@blueprintjs/core';
import { Popover2 } from '@blueprintjs/popover2';
import { normalizeSubtasks, readSubtasksFromFiles } from '@hydrooj/utils/lib/common';
import { TestCaseConfig } from 'hydrooj';
import { isEqual } from 'lodash';
import React from 'react';
import { DndProvider, useDrop } from 'react-dnd';
import { HTML5Backend } from 'react-dnd-html5-backend';
import { useDispatch, useSelector, useStore } from 'react-redux';
import { i18n } from 'vj/utils';
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
  const cases = useSelector((state: RootState) => (subtaskId === -1
    ? state.config.__cases
    : state.config.subtasks.find((i) => i.id === subtaskId).cases || []));
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

  function deleteSubtask() {
    dispatch({
      type: 'problemconfig/moveTestcases',
      payload: {
        target: -1,
        source: subtaskId,
        cases,
      },
    });
    dispatch({
      type: 'problemconfig/deleteSubtask',
      id: subtaskId,
    });
  }

  return (
    <li className="bp4-tree-node bp4-tree-node-expanded">
      {subtaskId !== -1 && <div className="bp4-tree-node-content" onClick={() => setExpand((e) => !e)}>
        <Icon icon={expand ? 'folder-open' : 'folder-close'} />&nbsp;
        <span className="bp4-tree-node-label">{i18n('Subtask {0}', subtaskId)}</span>
        <span className="bp4-tree-node-secondary-label" onClick={(ev) => ev.stopPropagation()}>
          <Popover2
            content={<div style={{ padding: 20 }}>
              <b>{i18n('Are you sure you want to delete this subtask?')}</b>
              <div style={{ display: 'flex', justifyContent: 'flex-end', marginTop: 15 }}>
                <Button intent="danger" onClick={deleteSubtask}>{i18n('Delete')}</Button>
              </div>
            </div>}
          >
            <Icon icon="trash" />
          </Popover2>
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
            label={<>&nbsp;{cases.length} testcases.</>}
            path={[0]}
          />}
        {!cases.length && (
          <li className="bp4-tree-node">
            <div className="bp4-tree-node-content">
              <span className="bp4-tree-node-caret-none bp4-icon-standard"></span>
              <span className="bp4-tree-node-label">{subtaskId === -1
                ? i18n('No testcase here')
                : i18n('Drag and drop testcases here:')}</span>
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
        <li className="bp4-tree-node" onClick={autoConfigure}>
          <div className="bp4-tree-node-content bp4-tree-node-content-0">
            <Icon icon="clean" />&nbsp;
            <span className="bp4-tree-node-label">{i18n('Auto configure')}</span>
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
            <span className="bp4-tree-node-label">{i18n('Add new subtask')}</span>
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
