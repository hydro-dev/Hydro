import {
  Button, ControlGroup,
  Dialog, DialogBody, DialogFooter,
  Icon, InputGroup, TreeNode,
} from '@blueprintjs/core';
import { TestCaseConfig } from 'hydrooj';
import React from 'react';
import { DndProvider, useDrop } from 'react-dnd';
import { HTML5Backend } from 'react-dnd-html5-backend';
import { useDispatch, useSelector } from 'react-redux';
import { RootState } from './reducer';
import { SelectionManager } from './tree/SelectionManager';

interface TestcasesDndItem {
  cases: TestCaseConfig[];
  subtaskId?: number;
}

interface SubtaskSettingsProps {
  subtaskId: number;
  time: string;
  memory: string;
}

export function SubtaskSettings(props: SubtaskSettingsProps) {
  const [open, setOpen] = React.useState(false);
  const score = useSelector((state: RootState) => state.config.subtasks.find((i) => i.id === props.subtaskId).score);
  const time = useSelector((state: RootState) => state.config.subtasks.find((i) => i.id === props.subtaskId).time);
  const memory = useSelector((state: RootState) => state.config.subtasks.find((i) => i.id === props.subtaskId).memory);

  const [ctime, setTime] = React.useState(time);
  const [cmemory, setMemory] = React.useState(memory);
  const [cscore, setScore] = React.useState(score);
  const dispatcher = (func, key) => (ev: React.ChangeEvent<HTMLInputElement | HTMLSelectElement> | number) => {
    let value = typeof ev !== 'object' ? ev : ev.currentTarget?.value;
    if (key === 'score') value = +value;
    func(value);
  };

  const dispatch = useDispatch();
  function onConfirm() {
    dispatch({
      type: 'problemconfig/updateSubtaskConfig',
      id: props.subtaskId,
      time: ctime,
      memory: cmemory,
      score: cscore,
    });
    setOpen(false);
  }

  return (<>
    <Dialog title="Set limits" icon="cog" minimal isOpen={open} onClose={() => setOpen(false)}>
      <DialogBody>
        <ControlGroup fill={true} vertical={false}>
          <InputGroup
            leftElement={<Icon icon="time" />}
            onChange={dispatcher(setTime, 'time')}
            placeholder={`Inherit (${props.time})`}
            value={ctime || ''}
          />
          <InputGroup
            leftElement={<Icon icon="comparison" />}
            onChange={dispatcher(setMemory, 'memory')}
            placeholder={`Inherit (${props.memory})`}
            value={cmemory || ''}
          />
          <InputGroup
            leftElement={<Icon icon="star" />}
            onChange={dispatcher(setScore, 'score')}
            placeholder="Score"
            type="number"
            value={cscore.toString()}
          />
        </ControlGroup>
      </DialogBody>
      <DialogFooter actions={<Button onClick={onConfirm} intent="primary" text="Save" />} />
    </Dialog>
    <li className="bp4-tree-node" onClick={() => setOpen(true)}>
      <div className="bp4-tree-node-content">
        <span className="bp4-tree-node-caret-none bp4-icon-standard"></span>
        <Icon icon="time" />
        &nbsp;&nbsp;
        <span className="bp4-tree-node-label">{time || props.time}</span>
        <Icon icon="comparison" />
        &nbsp;&nbsp;
        <span className="bp4-tree-node-label">{memory || props.memory}</span>
        <Icon icon="star" />
        {' '}
        <span className="bp4-tree-node-secondary-label">{score || 0}</span>
      </div>
    </li>
  </>);
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

export function ProblemConfigTree() {
  const ids = useSelector((s: RootState) => Object.values(s.config?.subtasks || []).map((i) => i.id));
  const time = useSelector((s: RootState) => s.config?.time);
  const memory = useSelector((s: RootState) => s.config?.memory);
  const [open, setOpen] = React.useState(false);
  const [ctime, setTime] = React.useState(time);
  const [cmemory, setMemory] = React.useState(memory);
  React.useEffect(() => {
    setTime(time);
  }, [time]);
  React.useEffect(() => {
    setMemory(memory);
  }, [memory]);
  const dispatch = useDispatch();
  function onConfirm() {
    dispatch({
      type: 'problemconfig/updateGlobalConfig',
      time: ctime,
      memory: cmemory,
    });
    setOpen(false);
  }
  return (
    <DndProvider backend={HTML5Backend}>
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
          <Dialog title="Set limits" icon="cog" minimal isOpen={open} onClose={() => setOpen(false)}>
            <DialogBody>
              <ControlGroup fill={true} vertical={false}>
                <InputGroup
                  leftElement={<Icon icon="time" />}
                  onChange={(ev) => setTime(ev.currentTarget.value)}
                  placeholder="1s"
                  value={ctime || ''}
                />
                <InputGroup
                  leftElement={<Icon icon="comparison" />}
                  onChange={(ev) => setMemory(ev.currentTarget.value)}
                  placeholder="256m"
                  value={cmemory || ''}
                />
              </ControlGroup>
            </DialogBody>
            <DialogFooter actions={<Button onClick={onConfirm} intent="primary" text="Save" />} />
          </Dialog>
          <li className="bp4-tree-node" onClick={() => setOpen(true)}>
            <div className="bp4-tree-node-content">
              <Icon icon="time" />
              &nbsp;&nbsp;
              <span className="bp4-tree-node-label">{time}</span>
              <Icon icon="comparison" />
              {' '}
              <span className="bp4-tree-node-secondary-label">{memory}</span>
            </div>
          </li>
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
    </DndProvider>
  );
}
