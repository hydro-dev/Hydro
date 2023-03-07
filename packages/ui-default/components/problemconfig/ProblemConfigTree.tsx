import {
  Button, Checkbox, ControlGroup,
  Dialog, DialogBody, DialogFooter,
  Icon, InputGroup, Menu, MenuItem, TreeNode,
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
      <TestcaseNode c={c} key={c.input} {...omit(props, 'onClick')} index={index + id} />
    ))}
  </div>;
}

interface SubtaskSettingsDialogProps {
  subtask: SubtaskConfig;
  time: string;
  memory: string;
}

export function SubtaskSettings(props: SubtaskSettingsDialogProps) {
  const { subtask } = props;
  const [inheritLimits, setInheritLimits] = React.useState(true);
  const [open, setOpen] = React.useState(false);

  const dispatch = useDispatch();
  const dispatcher = (key: string, suffix = '') => (ev: React.ChangeEvent<HTMLInputElement | HTMLSelectElement> | number) => {
    let value = typeof ev !== 'object' ? ev : ev.currentTarget?.value;
    if (value === 0) value = '';
    if (value && suffix) value += suffix;
    dispatch({
      type: 'CONFIG_SUBTASK_UPDATE', id: subtask.id, key, value,
    });
  };

  return (<>
    <Dialog title="Set limits" icon="cog" minimal isOpen={open} onClose={() => setOpen(false)}>
      <DialogBody>
        <Checkbox checked={inheritLimits} onChange={(ev) => setInheritLimits((ev.target as any).checked)}>
          Inherit limits
        </Checkbox>
        <ControlGroup fill={true} vertical={false}>
          <InputGroup
            disabled={inheritLimits}
            large={false}
            leftElement={<Icon icon="time" />}
            onChange={dispatcher('time')}
            placeholder="Time limit"
            readOnly={false}
            small={false}
            value={inheritLimits ? props.time : subtask.time || props.time}
          />
          <InputGroup
            disabled={inheritLimits}
            large={false}
            leftElement={<Icon icon="comparison" />}
            onChange={dispatcher('memory')}
            placeholder="Memory limit"
            readOnly={false}
            small={false}
            value={inheritLimits ? props.memory : subtask.memory || props.memory}
          />
          <InputGroup
            large={false}
            leftElement={<Icon icon="star" />}
            onChange={dispatcher('score')}
            placeholder="Score"
            readOnly={false}
            type="number"
            small={false}
            value={subtask.score.toString()}
          />
        </ControlGroup>
      </DialogBody>
      <DialogFooter actions={<Button intent="primary" text="Save" />} />
    </Dialog>
    <li className="bp4-tree-node" onClick={() => setOpen(true)}>
      <div className="bp4-tree-node-content">
        <span className="bp4-tree-node-caret-none bp4-icon-standard"></span>
        <Icon icon="time" />
        &nbsp;&nbsp;
        <span className="bp4-tree-node-label">{subtask.time || props.time}</span>
        <Icon icon="comparison" />
        &nbsp;&nbsp;
        <span className="bp4-tree-node-label">{subtask.memory || props.memory}</span>
        <Icon icon="star" />
        {' '}
        <span className="bp4-tree-node-secondary-label">{subtask.score || 0}</span>
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
    time, memory, subtaskIds,
  } = props;
  const subtask = useSelector((state: RootState) => state.config.subtasks.find((i) => i.id === props.subtaskId));
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
  React.useEffect(() => {
    setStart(0);
    setEnd(0);
  }, [JSON.stringify(subtask.cases)]);
  const handleMouseDown = React.useCallback((event: React.MouseEvent<HTMLUListElement, MouseEvent>) => {
    pos.x = event.pageX;
    pos.y = event.pageY;
    // Check if clicking on a selected testcase
    const selected = Array.from($('[data-selected="true"]'));
    console.log(selected);
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
  }, []);
  const handleMouseMove = React.useCallback((event) => {
    pos.endX = event.pageX;
    pos.endY = event.pageY;
    $('#divSelectArea').css({
      top: Math.min(event.pageY, pos.y),
      left: Math.min(event.pageX, pos.x),
      height: Math.abs(event.pageY - pos.y),
      width: Math.abs(event.pageX - pos.x),
    });
  }, []);
  const handleMouseUp = React.useCallback(() => {
    document.body.removeEventListener('mousemove', handleMouseMove);
    document.body.removeEventListener('mouseup', handleMouseUp);
    const cases = Array.from($(`[data-subtaskid="${subtask.id}"]`));
    const selected = [];
    for (let i = 0; i < cases.length; i += 1) {
      if (collide(cases[i], $('#divSelectArea')[0])) {
        selected.push(subtask.cases.indexOf(subtask.cases.find((c) => c.input === cases[i].dataset.index)));
      }
    }
    const sorted = selected.sort((a, b) => a - b);
    setStart(sorted[0]);
    setEnd(sorted[selected.length - 1] + 1);
    $('#divSelectArea').remove();
    $('body').css('cursor', 'default');
    pos.x = pos.y = pos.endX = pos.endY = 0;
  }, []);

  return (
    <li className="bp4-tree-node bp4-tree-node-expanded">
      <div className="bp4-tree-node-content" onClick={() => setExpand((e) => !e)}>
        <Icon icon={expand ? 'folder-open' : 'folder-close'} />&nbsp;
        <span className="bp4-tree-node-label">Subtask {subtask.id}</span>
        <span className="bp4-tree-node-secondary-label">
          <Icon icon="trash"></Icon>
        </span>
      </div>
      <ul className="bp4-tree-node-list" ref={drop} onMouseDown={handleMouseDown}>
        <SubtaskSettings subtask={subtask} time={time} memory={memory} />
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
                index={id}
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
                index={start}
              />
            )}
            {end < subtask.cases.length && subtask.cases.slice(end).map((c, id) => (
              <TestcaseGroup
                c={c} subtaskId={subtask.id}
                cases={[c]}
                key={c.input}
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
