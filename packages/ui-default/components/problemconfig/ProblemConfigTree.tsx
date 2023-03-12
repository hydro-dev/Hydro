import {
  Button, ControlGroup,
  Dialog, DialogBody, DialogFooter,
  Icon, InputGroup, Menu, MenuItem, TreeNode,
} from '@blueprintjs/core';
import { ContextMenu2 } from '@blueprintjs/popover2';
import { TestCaseConfig } from 'hydrooj';
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
  index: number;
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
    <ContextMenu2
      onContextMenu={onClick}
      data-subtaskid={subtaskId}
      data-index={c.input}
      data-selected={selected}
      content={
        <Menu>
          <MenuItem icon="drawer-left" text="Move to subtask" >
            {subtaskIds.filter((i) => i !== subtaskId).map((i) => (
              <MenuItem key={i} text={`Subtask ${i}`} />
            ))}
            {subtaskIds.length <= 1 && (
              <MenuItem icon="disable" disabled text="No target available" />
            )}
          </MenuItem>
        </Menu>
      }
    >
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
    cases, subtaskId, onClick, index,
  } = props;
  const [collected, drag] = useDrag(() => ({
    type: 'cases',
    collect: (monitor) => ({
      isDragging: monitor.isDragging(),
    }),
    canDrag: props.selected,
    item: { cases, subtaskId },
  }), [JSON.stringify(cases), subtaskId]);
  return <div ref={drag} onClick={onClick} style={{ opacity: collected.isDragging ? 0.5 : 1 }}>
    {cases.map((c, id) => (
      <TestcaseNode c={c} key={`${c.input}@${index + id}`} {...omit(props, 'onClick')} index={index + id} />
    ))}
  </div>;
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
            large={false}
            leftElement={<Icon icon="time" />}
            onChange={dispatcher(setTime, 'time')}
            placeholder={`Inherit (${props.time})`}
            readOnly={false}
            small={false}
            value={ctime || ''}
          />
          <InputGroup
            large={false}
            leftElement={<Icon icon="comparison" />}
            onChange={dispatcher(setMemory, 'memory')}
            placeholder={`Inherit (${props.memory})`}
            readOnly={false}
            small={false}
            value={cmemory || ''}
          />
          <InputGroup
            large={false}
            leftElement={<Icon icon="star" />}
            onChange={dispatcher(setScore, 'score')}
            placeholder="Score"
            readOnly={false}
            type="number"
            small={false}
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

function collide(rect1: any, rect2: any): boolean {
  if ('getBoundingClientRect' in rect1) rect1 = rect1.getBoundingClientRect();
  if ('getBoundingClientRect' in rect2) rect2 = rect2.getBoundingClientRect();
  const maxX = Math.max(rect1.x + rect1.width, rect2.x + rect2.width);
  const maxY = Math.max(rect1.y + rect1.height, rect2.y + rect2.height);
  const minX = Math.min(rect1.x, rect2.x);
  const minY = Math.min(rect1.y, rect2.y);
  if (maxX - minX <= rect1.width + rect2.width && maxY - minY <= rect1.height + rect2.height) {
    return true;
  }
  return false;
}

export function SubtaskNode(props: SubtaskNodeProps) {
  const {
    time, memory, subtaskIds, subtaskId,
  } = props;
  const cases = JSON.parse(useSelector((state: RootState) => JSON.stringify(state.config.subtasks.find((i) => i.id === subtaskId).cases || [])));
  const dispatch = useDispatch();
  const [expand, setExpand] = React.useState(true);
  // Don't need to trigger a re-render for this property change
  const pos = React.useMemo(() => ({
    x: 0, y: 0, endX: 0, endY: 0,
  }), []);
  const [start, setStart] = React.useState(0);
  const [end, setEnd] = React.useState(0);
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
  React.useEffect(() => {
    setStart(0);
    setEnd(0);
  }, [JSON.stringify(cases)]);
  const handleMouseDown = React.useCallback((event: React.MouseEvent<HTMLUListElement, MouseEvent>) => {
    pos.x = event.pageX;
    pos.y = event.pageY;
    // Check if clicking on a selected testcase
    const selected = Array.from($('[data-selected="true"]'));
    for (const el of selected) {
      if (collide(el, { ...pos, width: 1, height: 1 })) return;
    }
    // eslint-disable-next-line @typescript-eslint/no-use-before-define
    document.body.addEventListener('mousemove', handleMouseMove);
    // eslint-disable-next-line @typescript-eslint/no-use-before-define
    document.body.addEventListener('mouseup', handleMouseUp);
    $('body').css('cursor', 'crosshair')
      .append('<div id="divSelectArea" style="position:absolute;background-color:#e073d4;"></div>');
    $('#divSelectArea').css({
      top: event.pageY,
      left: event.pageX,
      zIndex: 9999999,
    }).fadeTo(12, 0.2);
  }, [JSON.stringify(cases)]);
  const handleMouseMove = React.useCallback((event) => {
    pos.endX = event.pageX;
    pos.endY = event.pageY;
    $('#divSelectArea').css({
      top: Math.min(event.pageY, pos.y),
      left: Math.min(event.pageX, pos.x),
      height: Math.abs(event.pageY - pos.y),
      width: Math.abs(event.pageX - pos.x),
    });
  }, [JSON.stringify(cases)]);
  const handleMouseUp = React.useCallback(() => {
    document.body.removeEventListener('mousemove', handleMouseMove);
    document.body.removeEventListener('mouseup', handleMouseUp);
    const caseEntries = Array.from($(`[data-subtaskid="${subtaskId}"]`));
    const selected = [];
    for (let i = 0; i < caseEntries.length; i += 1) {
      if (collide(caseEntries[i], $('#divSelectArea')[0])) {
        selected.push(cases.indexOf(cases.find((c) => c.input === caseEntries[i].dataset.index)));
      }
    }
    const sorted = selected.sort((a, b) => a - b);
    $('#divSelectArea').remove();
    $('body').css('cursor', 'default');
    pos.x = pos.y = pos.endX = pos.endY = 0;
    if (!sorted.length) return;
    setStart(sorted[0]);
    setEnd(sorted[selected.length - 1] + 1);
  }, [JSON.stringify(cases)]);

  return (
    <li className="bp4-tree-node bp4-tree-node-expanded">
      <div className="bp4-tree-node-content" onClick={() => setExpand((e) => !e)}>
        <Icon icon={expand ? 'folder-open' : 'folder-close'} />&nbsp;
        <span className="bp4-tree-node-label">Subtask {subtaskId}</span>
        <span className="bp4-tree-node-secondary-label">
          <Icon icon="trash"></Icon>
        </span>
      </div>
      <ul className="bp4-tree-node-list" ref={drop} onMouseDown={handleMouseDown}>
        <SubtaskSettings subtaskId={subtaskId} time={time} memory={memory} />
        {expand
          ? <>
            {end > start && cases.slice(0, start).map((c, id) => (
              <TestcaseGroup
                c={c}
                subtaskId={subtaskId}
                cases={[c]}
                key={`${c.input}@${id}`}
                selected={false}
                subtaskIds={subtaskIds}
                index={id}
                onClick={() => {
                  setStart(id);
                  setEnd(id + 1);
                }}
              />
            ))}
            {start <= end && (
              <TestcaseGroup
                cases={cases.slice(start, end)}
                subtaskId={subtaskId}
                subtaskIds={subtaskIds}
                selected={true}
                index={start}
              />
            )}
            {end < cases.length && cases.slice(end).map((c, id) => (
              <TestcaseGroup
                c={c} subtaskId={subtaskId}
                cases={[c]}
                key={`${c.input}@${id}`}
                subtaskIds={subtaskIds}
                selected={false}
                index={id + end}
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
              <span className="bp4-tree-node-label">{cases.length} testcases.</span>
            </div>
          </li>
        }
        {!cases?.length && (
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
  const dispatch = useDispatch();
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
