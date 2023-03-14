import { Icon, TreeNode } from '@blueprintjs/core';
import { TestCaseConfig } from 'hydrooj';
import React from 'react';
import { DndProvider, useDrop } from 'react-dnd';
import { HTML5Backend } from 'react-dnd-html5-backend';
import { useDispatch, useSelector } from 'react-redux';
import { RootState } from './reducer';
import { SelectionManager } from './tree/SelectionManager';
import { GlobalSettings, SubtaskSettings } from './tree/SubtaskSettings';

interface TestcasesDndItem {
  cases: TestCaseConfig[];
  subtaskId?: number;
}

interface SubtaskNodeProps {
  subtaskId: number;
  time?: string;
  memory?: string;
  subtaskIds: number[];
}

export function SubtaskNode(props: SubtaskNodeProps) {
  const {
    time, memory, subtaskIds, subtaskId,
  } = props;
  const clen = useSelector((state: RootState) => state.config.subtasks.find((i) => i.id === subtaskId).cases?.length || 0);
  const dispatch = useDispatch();
  const [expand, setExpand] = React.useState(true);
  const [, drop] = useDrop<TestcasesDndItem>(() => ({
    accept: 'cases',
    canDrop(item) {
      return subtaskId && item.subtaskId !== subtaskId;
    },
    drop(item) {
      dispatch({
        type: 'problemconfig/moveTestcases',
        payload: {
          subtaskId,
          cases: item.cases,
        },
      });
    },
  }));

  return (
    <li className="bp4-tree-node bp4-tree-node-expanded">
      <div className="bp4-tree-node-content" onClick={() => setExpand((e) => !e)}>
        <Icon icon={expand ? 'folder-open' : 'folder-close'} />&nbsp;
        <span className="bp4-tree-node-label">Subtask {subtaskId}</span>
        <span className="bp4-tree-node-secondary-label">
          <Icon icon="trash"></Icon>
        </span>
      </div>
      <ul className="bp4-tree-node-list" ref={drop}>
        <SubtaskSettings subtaskId={subtaskId} time={time} memory={memory} />
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
              <span className="bp4-tree-node-label">Drag and drop testcases here:</span>
            </div>
          </li>
        )}
      </ul>
    </li>
  );
}

export function SubtaskConfigTree() {
  const ids = useSelector((s: RootState) => Object.values(s.config?.subtasks || []).map((i) => i.id));
  const time = useSelector((s: RootState) => s.config?.time);
  const memory = useSelector((s: RootState) => s.config?.memory);
  const dispatch = useDispatch();
  return (
    <div className="bp4-tree">
      <ul className="bp4-tree-node-list bp4-tree-root">
        <li
          className="bp4-tree-node"
          onClick={() => dispatch({ type: 'AUTO_CONFIGURE' })}
        >
          <div className="bp4-tree-node-content bp4-tree-node-content-0">
            <Icon icon="clean" />&nbsp;
            <span className="bp4-tree-node-label">Auto Configure</span>
          </div>
        </li>
        <GlobalSettings />
        {ids.map((id) => (
          <SubtaskNode
            key={id}
            subtaskId={id}
            time={time}
            memory={memory}
            subtaskIds={ids}
          />
        ))}
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

function TestcaseConfigTree() {
  return (<>
  </>);
}

export function ProblemConfigTree() {
  return (
    <DndProvider backend={HTML5Backend}>
      <div className="row">
        <div className="medium-6 columns">
          <SubtaskConfigTree />
        </div>
        <div className="medium-6 columns">
          <TestcaseConfigTree />
        </div>
      </div>
    </DndProvider>
  );
}
