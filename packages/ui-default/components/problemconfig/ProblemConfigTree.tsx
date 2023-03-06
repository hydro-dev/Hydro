import {
  Icon, Menu, MenuItem, TreeNode,
} from '@blueprintjs/core';
import { ContextMenu2 } from '@blueprintjs/popover2';
import { SubtaskConfig, TestCaseConfig } from 'hydrooj';
import { omit } from 'lodash';
import React from 'react';
import { DndProvider, useDrag, useDrop } from 'react-dnd';
import { HTML5Backend } from 'react-dnd-html5-backend';
import { useDispatch, useSelector } from 'react-redux';
import { RootState } from './reducer';

interface TestcasesDndItem {
  cases: TestCaseConfig[];
  subtaskId?: number;
}

interface TestcaseNodeProps {
  c: TestCaseConfig;
  time?: string;
  memory?: string;
  onClick?: () => void;
  selected: boolean;
  subtaskId: number;
  subtaskIds: number[];
}

export function TestcaseNode(props: TestcaseNodeProps) {
  const {
    c, selected, onClick, subtaskIds, subtaskId,
  } = props;
  return (
    <ContextMenu2 content={
      <Menu>
        <MenuItem icon="drawer-left" text="Move to subtask" >
          {subtaskIds.filter((i) => i !== subtaskId).map((i) => (
            <MenuItem key={i} text={`Subtask ${i}`} />
          ))}
          {subtaskIds.length <= 1 && (
            <MenuItem icon="disable" disabled text="No target available" />
          )}
        </MenuItem>
        <MenuItem text="Save as..." />
        <MenuItem text="Delete..." intent="danger" />
      </Menu>
    }>
      <TreeNode
        depth={0}
        id={c.input}
        isSelected={selected}
        onClick={onClick}
        icon="document"
        label={<>&nbsp;{c.input} / {c.output}</>}
        path={[0]}
      >
      </TreeNode>
    </ContextMenu2>
  );
}

interface TestcaseGroupProps extends Omit<TestcaseNodeProps, 'c'> {
  cases: TestCaseConfig[];
}

export function TestcaseGroup(props: TestcaseGroupProps) {
  const {
    cases, subtaskId, onClick,
  } = props;
  const [collected, drag] = useDrag(() => ({
    type: 'cases',
    collect: (monitor) => ({
      isDragging: monitor.isDragging(),
    }),
    item: { cases, subtaskId },
  }), [JSON.stringify(cases), subtaskId]);
  return <div ref={drag} onClick={onClick} style={{ opacity: collected.isDragging ? 0.5 : 1 }}>
    {cases.map((c) => <TestcaseNode c={c} key={c.input} {...omit(props, 'onClick')} />)}
  </div>;
}

interface SubtaskNodeProps {
  subtask: SubtaskConfig;
  time?: string;
  memory?: string;
  subtaskIds: number[];
}

export function SubtaskNode(props: SubtaskNodeProps) {
  const {
    subtask, time, memory, subtaskIds,
  } = props;
  const dispatch = useDispatch();
  const [expand, setExpand] = React.useState(true);
  const [start, setStart] = React.useState(0);
  const [end, setEnd] = React.useState(0);
  const [, drop] = useDrop<TestcasesDndItem>(() => ({
    accept: 'cases',
    canDrop(item) {
      return subtask.id && item.subtaskId !== subtask.id;
    },
    drop(item) {
      dispatch({
        type: 'problemconfig/moveTestcases',
        payload: {
          subtaskId: subtask.id,
          cases: item.cases,
        },
      });
    },
  }));
  return (
    <li className="bp4-tree-node bp4-tree-node-expanded">
      <div className="bp4-tree-node-content" onClick={() => setExpand((e) => !e)}>
        <Icon icon="folder-open" />&nbsp;
        <span className="bp4-tree-node-label">Subtask {subtask.id}</span>
        <span className="bp4-tree-node-secondary-label">
          <Icon icon="trash"></Icon>
        </span>
      </div>
      <ul className="bp4-tree-node-list" ref={drop}>
        <li className="bp4-tree-node">
          <div className="bp4-tree-node-content">
            <span className="bp4-tree-node-caret-none bp4-icon-standard"></span>
            <Icon icon="time" />
            &nbsp;&nbsp;
            <span className="bp4-tree-node-label">{time || subtask.time}</span>
            <Icon icon="comparison" />
            &nbsp;&nbsp;
            <span className="bp4-tree-node-label">{memory || subtask.memory}</span>
            <Icon icon="star" />
            {' '}
            <span className="bp4-tree-node-secondary-label">{subtask.score || 0}</span>
          </div>
        </li>
        {expand
          ? <>
            {end > start && subtask.cases.slice(0, start).map((c, id) => (
              <TestcaseGroup
                c={c}
                subtaskId={subtask.id}
                cases={[c]}
                key={c.input}
                selected={false}
                subtaskIds={subtaskIds}
                onClick={() => {
                  setStart(id);
                  setEnd(id + 1);
                }}
              />
            ))}
            {start <= end && (
              <TestcaseGroup
                cases={subtask.cases.slice(start, end)}
                subtaskId={subtask.id}
                subtaskIds={subtaskIds}
                selected={true}
              />
            )}
            {end < subtask.cases.length && subtask.cases.slice(end).map((c, id) => (
              <TestcaseGroup
                c={c} subtaskId={subtask.id}
                cases={[c]}
                key={c.input}
                subtaskIds={subtaskIds}
                selected={false}
                onClick={() => {
                  setStart(id + end);
                  setEnd(id + end + 1);
                }}
              />
            ))}
          </>
          : <li className="bp4-tree-node">
            <div className="bp4-tree-node-content">
              <span className="bp4-tree-node-caret-none bp4-icon-standard"></span>
              <Icon icon="layers" />&nbsp;
              <span className="bp4-tree-node-label">{subtask.cases.length} testcases.</span>
            </div>
          </li>
        }
        {!subtask.cases?.length && (
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

export function ProblemConfigTree() {
  const testdata = useSelector((s: RootState) => s.testdata);
  const config = useSelector((s: RootState) => s.config);
  const dispatch = useDispatch();
  const subtasks = config.subtasks || [];
  console.log(testdata, config);
  return (
    <DndProvider backend={HTML5Backend}>
      <div className="bp4-tree">
        <ul className="bp4-tree-node-list bp4-tree-root">
          <li
            className="bp4-tree-node"
            onClick={() => dispatch({ type: 'AUTO_CONFIGURE' })}
          >
            <div className="bp4-tree-node-content  bp4-tree-node-content-0">
              <Icon icon="clean" />&nbsp;
              <span className="bp4-tree-node-label">Auto Configure</span>
            </div>
          </li>
          {subtasks.map((subtask) => (
            <SubtaskNode
              subtask={subtask}
              time={config.time}
              memory={config.memory}
              subtaskIds={Object.values(subtasks).map((i) => i.id)}
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
    </DndProvider>
  );
}
