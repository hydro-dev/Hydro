import { TestCaseConfig } from 'hydrooj';
import { Text } from '@mantine/core';
import { omit } from 'lodash';
import { useContextMenu } from 'mantine-contextmenu';
import React from 'react';
import { useDrag } from 'react-dnd';
import { useDispatch } from 'react-redux';
import { i18n } from 'vj/utils';

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
    c, selected, onClick, subtaskId,
  } = props;
  let display = `${c.input} / ${c.output}`;
  const minlength = Math.min(c.input.length, c.output.length);
  for (let i = minlength; i >= 0; i--) {
    const prefix = c.input.slice(0, i);
    if (c.input.startsWith(prefix) && c.output.startsWith(prefix)) {
      display = `${prefix}(${c.input.substring(i)}/${c.output.substring(i)})`;
      break;
    }
  }
  return (
    <div
      onClick={onClick}
      data-subtaskid={subtaskId}
      data-index={c.input}
      data-selected={selected}
      style={{
        paddingLeft: 22,
        display: 'flex',
        alignItems: 'center',
        cursor: 'pointer',
        background: selected ? 'var(--mantine-color-blue-light, #ebf3ff)' : 'transparent',
        borderRadius: 4,
        fontFamily: 'var(--mantine-font-family-monospace)',
      }}
    >
      <Text ml="xs"><i className="icon icon-file" /> {display}</Text>
    </div>
  );
}

interface TestcaseGroupProps extends Omit<TestcaseNodeProps, 'c'> {
  cases: TestCaseConfig[];
  onMouseDown?: (event: React.MouseEvent<HTMLDivElement, MouseEvent>) => void;
}

export function TestcaseGroup(props: TestcaseGroupProps) {
  const {
    cases, subtaskId, subtaskIds, onClick, index,
  } = props;
  const dispatch = useDispatch();
  const { showContextMenu } = useContextMenu();
  const moveTargets = subtaskIds.filter((i) => i !== subtaskId);
  const [collected, drag] = useDrag(() => ({
    type: 'cases',
    collect: (monitor) => ({
      isDragging: monitor.isDragging(),
    }),
    canDrag: props.selected,
    item: { cases, subtaskId },
  }), [JSON.stringify(cases), subtaskId]);
  return <div
    ref={drag as any}
    onClick={onClick}
    onMouseDown={props.onMouseDown}
    onContextMenu={showContextMenu(
      moveTargets.length
        ? moveTargets.map((id) => ({
          key: `move-${id}`,
          icon: <i className="icon icon-send" />,
          title: `${i18n('Move to')} ${i18n('Subtask {0}', id)}`,
          onClick: () => dispatch({
            type: 'problemconfig/moveTestcases',
            payload: { target: id, source: subtaskId, cases },
          }),
        }))
        : [{ key: 'no-target', title: i18n('No target available'), onClick: () => { }, disabled: true }],
    )}
    style={{ opacity: collected.isDragging ? 0.5 : 1 }}
  >
    {cases.map((c, id) => (
      <TestcaseNode c={c} key={`${c.input}@${index + id}`} {...omit(props, 'onClick')} index={index + id} />
    ))}
  </div>;
}
