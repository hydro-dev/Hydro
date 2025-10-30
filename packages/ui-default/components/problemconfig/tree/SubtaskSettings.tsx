import { CustomSelectAutoComplete } from '@hydrooj/components';
import { parseMemoryMB, parseTimeMS } from '@hydrooj/utils/lib/common';
import { Button, Group, Modal, Text, TextInput } from '@mantine/core';
import { isEqual } from 'lodash';
import React, { useEffect } from 'react';
import { useDispatch, useSelector } from 'react-redux';
import { i18n } from 'vj/utils';
import { RootState } from '../reducer';

interface SubtaskSettingsProps {
  subtaskIds: number[];
  subtaskId: number;
  time: string;
  memory: string;
}

export function SubtaskSettings(props: SubtaskSettingsProps) {
  const [open, setOpen] = React.useState(false);
  const [depsOpen, setDepsOpen] = React.useState(false);
  const subtaskIds = props.subtaskIds.filter((i) => i !== props.subtaskId);
  const score = useSelector((state: RootState) => state.config.subtasks.find((i) => i.id === props.subtaskId).score);
  const time = useSelector((state: RootState) => state.config.subtasks.find((i) => i.id === props.subtaskId).time);
  const memory = useSelector((state: RootState) => state.config.subtasks.find((i) => i.id === props.subtaskId).memory);
  const deps = useSelector((state: RootState) => state.config.subtasks.find((i) => i.id === props.subtaskId).if || [], isEqual);
  const type = useSelector((state: RootState) => state.config.subtasks.find((i) => i.id === props.subtaskId).type || 'min');

  const [ctime, setTime] = React.useState(time);
  const [cmemory, setMemory] = React.useState(memory);
  const [cscore, setScore] = React.useState(score);
  const [cdeps, setDeps] = React.useState(deps.join(', '));
  const [ctype, setType] = React.useState(type);

  const dispatch = useDispatch();
  useEffect(() => {
    dispatch({
      type: 'problemconfig/updateSubtaskConfig',
      id: props.subtaskId,
      payload: {
        type: ctype,
      },
    });
  }, [ctype]);

  function onConfirm() {
    dispatch({
      type: 'problemconfig/updateSubtaskConfig',
      id: props.subtaskId,
      payload: {
        time: ctime,
        memory: cmemory,
        score: cscore,
        if: cdeps.split(',').map((i) => i.trim()).filter((i) => +i).map((i) => +i),
      },
    });
    setOpen(false);
    setDepsOpen(false);
  }

  return (<>
    <Modal opened={open} onClose={() => setOpen(false)} title={i18n('Set time and memory limits')}>
      <Group grow>
        <TextInput
          leftSection={<i className="icon icon-stopwatch" />}
          rightSection={<Text size="sm">ms</Text>}
          rightSectionWidth={60}
          onChange={(ev) => setTime(ev.currentTarget.value ? `${ev.currentTarget.value}ms` : '')}
          placeholder={parseTimeMS(props.time, false).toString() || '1000'}
          value={ctime ? parseTimeMS(ctime, false).toString() || '' : ''}
        />
        <TextInput
          leftSection={<i className="icon icon-comparison" />}
          rightSection={<Text size="sm">MB</Text>}
          rightSectionWidth={60}
          onChange={(ev) => setMemory(ev.currentTarget.value ? `${ev.currentTarget.value}MB` : '')}
          placeholder={parseMemoryMB(props.memory, false).toString() || '256'}
          value={cmemory ? parseMemoryMB(cmemory, false).toString() || '' : ''}
        />
        <TextInput
          leftSection={<i className="icon icon-star" />}
          onChange={(ev) => setScore(+ev.target.value || 0)}
          placeholder="Score"
          type="number"
          value={cscore.toString()}
        />
      </Group>
      <div style={{ display: 'flex', justifyContent: 'flex-end', marginTop: 12 }}>
        <Button color="blue" onClick={onConfirm}>{i18n('Save')}</Button>
      </div>
    </Modal>
    <Modal opened={depsOpen} onClose={() => setDepsOpen(false)} title={i18n('Set dependencies')}>
      <CustomSelectAutoComplete
        data={subtaskIds.map((i) => ({ _id: i, name: `${i18n('Subtask {0}', i)}` }))}
        setSelectItems={cdeps.split(',').map((i) => i.trim()).filter((i) => +i).map((i) => +i)}
        onChange={(items) => setDeps(items)}
        placeholder="dependencies"
        multi
      />
      <div style={{ display: 'flex', justifyContent: 'flex-end', marginTop: 12 }}>
        <Button color="blue" onClick={onConfirm}>{i18n('Save')}</Button>
      </div>
    </Modal>
    <div style={{ paddingLeft: 22, display: 'flex', cursor: 'pointer', gap: 8 }} onClick={() => setOpen(true)}>
      <Text><i className="icon icon-stopwatch" /></Text>
      <Text className={time ? '' : 'text-gray'}>{time || props.time || '1s'}&nbsp;&nbsp;</Text>
      <Text><i className="icon icon-comparison" /></Text>
      <Text className={memory ? '' : 'text-gray'}>{memory || props.memory || '256m'}&nbsp;&nbsp;</Text>
      <Text><i className="icon icon-star" /></Text>
      <Text>{score || 0}</Text>
    </div>
    <div style={{ paddingLeft: 22, display: 'flex', alignItems: 'center', cursor: 'pointer', gap: 8 }} onClick={() => setDepsOpen(true)}>
      <Text><i className="icon icon-diagram-tree" /></Text>
      <Text>{i18n('Dependencies')}: {deps.length ? deps.join(', ') : i18n('(None)')}</Text>
    </div>
    <div style={{ paddingLeft: 22, display: 'flex', alignItems: 'center', gap: 8 }}>
      <i className="icon icon-asterisk" />
      <Text>{i18n('Scoring method')}</Text>
      <span style={{ marginLeft: 'auto' }}>
        <select className="compact select" value={ctype} onChange={(e) => setType(e.target.value)}>
          <option value="min">Min</option>
          <option value="max">Max</option>
          <option value="sum">Sum</option>
        </select>
      </span>
    </div>
  </>);
}

export function GlobalSettings() {
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
  return (<>
    <Modal opened={open} onClose={() => setOpen(false)} title={i18n('Set time and memory limits')}>
      <Group grow>
        <TextInput
          leftSection={<i className="icon icon-stopwatch" />}
          rightSection={<Text size="sm">ms</Text>}
          rightSectionWidth={60}
          onChange={(ev) => setTime(ev.currentTarget.value ? `${ev.currentTarget.value}ms` : '')}
          placeholder="1000"
          value={ctime ? parseTimeMS(ctime, false).toString() || '' : ''}
        />
        <TextInput
          leftSection={<i className="icon icon-comparison" />}
          rightSection={<Text size="sm">MB</Text>}
          rightSectionWidth={60}
          onChange={(ev) => setMemory(ev.currentTarget.value ? `${ev.currentTarget.value}MB` : '')}
          placeholder="256"
          value={cmemory ? parseMemoryMB(cmemory, false).toString() || '' : ''}
        />
      </Group>
      <div style={{ display: 'flex', justifyContent: 'flex-end', marginTop: 12 }}>
        <Button color="blue" onClick={onConfirm}>{i18n('Save')}</Button>
      </div>
    </Modal>
    <div style={{ paddingLeft: 22, display: 'flex', alignItems: 'center', cursor: 'pointer', gap: 8 }} onClick={() => setOpen(true)}>
      <i className="icon icon-stopwatch" />
      <Text className={time ? '' : 'text-gray'}>{time || '1s'}</Text>
      <i className="icon icon-comparison" />
      <Text className={memory ? '' : 'text-gray'}>{memory || '256MB'}</Text>
    </div>
  </>);
}
