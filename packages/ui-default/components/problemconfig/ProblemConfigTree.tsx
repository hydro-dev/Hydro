import { normalizeSubtasks, readSubtasksFromFiles } from '@hydrooj/common';
import { TestCaseConfig } from 'hydrooj';
import { Button, Text, Tree } from '@mantine/core';
import { isEqual } from 'lodash';
import React from 'react';
import { DndProvider, useDrop } from 'react-dnd';
import { HTML5Backend } from 'react-dnd-html5-backend';
import { useDispatch, useSelector, useStore } from 'react-redux';
import { confirm } from 'vj/components/dialog/index';
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
      type: 'problemconfig/deleteSubtask',
      id: subtaskId,
    });
  }

  return (
    <div style={{ marginBottom: 8 }}>
      {subtaskId !== -1 && (
        <div style={{ display: 'flex', alignItems: 'center', cursor: 'pointer' }} onClick={() => setExpand((e) => !e)}>
          <Text fw={600} style={{ marginRight: 8 }}>
            {expand ? <i className="icon icon-expand_more" /> : <i className="icon icon-expand_less" />}
          </Text>
          <Text>{i18n('Subtask {0}', subtaskId)}</Text>
          <Button
            variant="subtle"
            size="sm"
            color="black"
            style={{ marginLeft: 'auto' }}
            onClick={(ev) => {
              ev.stopPropagation();
              confirm(i18n('Are you sure you want to delete this subtask?')).then((yes) => {
                if (yes) deleteSubtask();
              });
            }}
          >
            <i className="icon icon-delete" />
          </Button>
        </div>
      )}
      <div ref={drop as any}>
        {subtaskId !== -1 && expand && (
          <SubtaskSettings subtaskId={subtaskId} subtaskIds={subtaskIds} time={time} memory={memory} />
        )}
        {expand
          ? <SelectionManager subtaskId={subtaskId} subtaskIds={subtaskIds} />
          : <div style={{ paddingLeft: 22 }}>
            <Text>{cases.length} testcases.</Text>
          </div>}
        {!cases.length && (
          <div style={{ paddingLeft: 22 }}>
            <Text c="dimmed">{subtaskId === -1
              ? i18n('No testcase here')
              : i18n('Drag and drop testcases here:')}</Text>
          </div>
        )}
      </div>
    </div>
  );
}

export function SubtaskConfigTree() {
  const ids = useSelector((s: RootState) => Object.values(s.config?.subtasks || []).map((i) => i.id), isEqual);
  const dispatch = useDispatch();
  const store = useStore<RootState>();
  const autoConfigure = React.useCallback(() => {
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
  }, [dispatch, store]);
  const rootNodes = React.useMemo<any[]>(() => [
    { id: 'auto', label: i18n('Auto configure'), type: 'action' as const },
    { id: 'global', label: i18n('Global settings'), type: 'global' as const },
    ...ids.map((id) => ({ id: `sub-${id}`, label: i18n('Subtask {0}', id), type: 'subtask' as const, subtaskId: id })),
    { id: 'add', label: i18n('Add new subtask'), type: 'add' as const },
  ], [ids]);

  return (
    <Tree
      data={rootNodes}
      levelOffset={12}
      renderNode={({ node }) => {
        const n: any = node;
        if (n.type === 'action') {
          return <div style={{ padding: '6px 0' }} onClick={autoConfigure}>
            <Text><i className="icon icon-settings" /> {i18n('Auto configure')}</Text>
          </div>;
        }
        if (n.type === 'global') return <GlobalSettings />;
        if (n.type === 'add') {
          return <div style={{ padding: '6px 0' }} onClick={() => dispatch({ type: 'problemconfig/addSubtask' })}>
            <Text><i className="icon icon-add" /> {i18n('Add new subtask')}</Text>
          </div>;
        }
        return <SubtaskNode subtaskId={n.subtaskId} />;
      }}
    />
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
          <div>
            <AddTestcase />
            <SubtaskNode subtaskId={-1} />
          </div>
        </div>
      </div>
    </DndProvider>
  );
}
