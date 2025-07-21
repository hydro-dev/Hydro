import { normalizeSubtasks, readSubtasksFromFiles } from '@hydrooj/common';
import { TestCaseConfig } from 'hydrooj';
import {
  Button, Classes, Icon, Popover, TreeNode,
} from '@blueprintjs/core';
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
    <li className={`${Classes.TREE_NODE} ${Classes.TREE_NODE_EXPANDED}`}>
      {subtaskId !== -1 && <div className={Classes.TREE_NODE_CONTENT} onClick={() => setExpand((e) => !e)}>
        <Icon icon={expand ? 'folder-open' : 'folder-close'} />&nbsp;
        <span className={Classes.TREE_NODE_LABEL}>{i18n('Subtask {0}', subtaskId)}</span>
        <span className={Classes.TREE_NODE_SECONDARY_LABEL} onClick={(ev) => ev.stopPropagation()}>
          <Popover
            content={<div style={{ padding: 20 }}>
              <b>{i18n('Are you sure you want to delete this subtask?')}</b>
              <div style={{ display: 'flex', justifyContent: 'flex-end', marginTop: 15 }}>
                <Button intent="danger" onClick={deleteSubtask}>{i18n('Delete')}</Button>
              </div>
            </div>}
          >
            <Icon icon="trash" />
          </Popover>
        </span>
      </div>}
      <ul className={Classes.TREE_NODE_LIST} ref={drop}>
        {subtaskId !== -1 && <SubtaskSettings subtaskId={subtaskId} subtaskIds={subtaskIds} time={time} memory={memory} />}
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
          <li className={Classes.TREE_NODE}>
            <div className={Classes.TREE_NODE_CONTENT}>
              <span className={`${Classes.TREE_NODE_CARET_NONE} ${Classes.ICON_STANDARD}`}></span>
              <span className={`${Classes.TREE_NODE_LABEL} text-gray`}>{subtaskId === -1
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
    const subtasks = readSubtasksFromFiles(state.testdata.map((t) => t.name), state.config);
    const cases = subtasks.reduce((a, b) => a.concat(b.cases), []);
    dispatch({
      type: 'CONFIG_AUTOCASES_UPDATE',
      subtasks: normalizeSubtasks(subtasks, (i) => i, state.config.time, state.config.memory, true),
    });
    dispatch({
      type: 'problemconfig/delTestcases',
      cases,
    });
  }
  return (
    <div className={Classes.TREE}>
      <ul className={`${Classes.TREE_NODE_LIST} ${Classes.TREE_ROOT}`}>
        <li className={Classes.TREE_NODE} onClick={autoConfigure}>
          <div className={`${Classes.TREE_NODE_CONTENT} ${Classes.TREE_NODE_CONTENT}-0`}>
            <Icon icon="clean" />&nbsp;
            <span className={Classes.TREE_NODE_LABEL}>{i18n('Auto configure')}</span>
          </div>
        </li>
        <GlobalSettings />
        {ids.map((id) => <SubtaskNode key={id} subtaskId={id} />)}
        <li
          className={Classes.TREE_NODE}
          onClick={() => dispatch({ type: 'problemconfig/addSubtask' })}
        >
          <div className={`${Classes.TREE_NODE_CONTENT} ${Classes.TREE_NODE_CONTENT}-0`}>
            <Icon icon="folder-new" />&nbsp;
            <span className={Classes.TREE_NODE_LABEL}>{i18n('Add new subtask')}</span>
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
          <div className={Classes.TREE}>
            <ul className={`${Classes.TREE_ROOT} ${Classes.TREE_NODE_LIST}`}>
              <AddTestcase />
              <SubtaskNode subtaskId={-1} />
            </ul>
          </div>
        </div>
      </div>
    </DndProvider>
  );
}
