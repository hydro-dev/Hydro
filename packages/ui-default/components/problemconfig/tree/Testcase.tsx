import { TestCaseConfig } from 'hydrooj';
import {
  ContextMenu, Menu, MenuItem, TreeNode,
} from '@blueprintjs/core';
import { omit } from 'lodash';
import React from 'react';
import { useDrag } from 'react-dnd';
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
    c, selected, onClick, subtaskIds, subtaskId,
  } = props;
  return (
    <ContextMenu
      onContextMenu={onClick}
      data-subtaskid={subtaskId}
      data-index={c.input}
      data-selected={selected}
      content={
        <Menu>
          <MenuItem icon="drawer-left" text={i18n('Move to subtask')}>
            {subtaskIds.filter((i) => i !== subtaskId).map((i) => (
              <MenuItem key={i} text={i18n('Subtask {0}', i)} />
            ))}
            {subtaskIds.length <= 1 && (
              <MenuItem icon="disable" disabled text={i18n('No target available')} />
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
      />
    </ContextMenu>
  );
}

interface TestcaseGroupProps extends Omit<TestcaseNodeProps, 'c'> {
  cases: TestCaseConfig[];
  onMouseDown?: (event: React.MouseEvent<HTMLDivElement, MouseEvent>) => void;
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
  return <div ref={drag} onClick={onClick} onMouseDown={props.onMouseDown} style={{ opacity: collected.isDragging ? 0.5 : 1 }}>
    {cases.map((c, id) => (
      <TestcaseNode c={c} key={`${c.input}@${index + id}`} {...omit(props, 'onClick')} index={index + id} />
    ))}
  </div>;
}
