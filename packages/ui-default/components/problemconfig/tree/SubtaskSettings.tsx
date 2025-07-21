import { CustomSelectAutoComplete } from '@hydrooj/components';
import { parseMemoryMB, parseTimeMS } from '@hydrooj/utils/lib/common';
import {
  Button, Classes, ControlGroup,
  Dialog, DialogBody, DialogFooter,
  Icon, InputGroup, Tag,
} from '@blueprintjs/core';
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
    <Dialog title={i18n('Set time and memory limits')} icon="cog" isOpen={open} onClose={() => setOpen(false)}>
      <DialogBody>
        <ControlGroup fill={true} vertical={false}>
          <InputGroup
            leftElement={<Icon icon="time" />}
            rightElement={<Tag minimal>ms</Tag>}
            onChange={(ev) => setTime(ev.currentTarget.value ? `${ev.currentTarget.value}ms` : '')}
            placeholder={parseTimeMS(props.time, false).toString() || '1000'}
            value={ctime ? parseTimeMS(ctime, false).toString() || '' : ''}
          />
          <InputGroup
            leftElement={<Icon icon="comparison" />}
            rightElement={<Tag minimal>MB</Tag>}
            onChange={(ev) => setMemory(ev.currentTarget.value ? `${ev.currentTarget.value}MB` : '')}
            placeholder={parseMemoryMB(props.memory, false).toString() || '256'}
            value={cmemory ? parseMemoryMB(cmemory, false).toString() || '' : ''}
          />
          <InputGroup
            leftElement={<Icon icon="star" />}
            onChange={(ev) => setScore(+ev.target.value || 0)}
            placeholder="Score"
            type="number"
            value={cscore.toString()}
          />
        </ControlGroup>
      </DialogBody>
      <DialogFooter actions={<Button className="primary rounded button" onClick={onConfirm} intent="primary" text="Save" />} />
    </Dialog>
    <Dialog title={i18n('Set dependencies')} icon="cog" isOpen={depsOpen} onClose={() => setDepsOpen(false)}>
      <DialogBody>
        <CustomSelectAutoComplete
          data={subtaskIds.map((i) => ({ _id: i, name: `${i18n('Subtask {0}', i)}` }))}
          setSelectItems={cdeps.split(',').map((i) => i.trim()).filter((i) => +i).map((i) => +i)}
          onChange={(items) => setDeps(items)}
          placeholder="dependencies"
          multi
        />
      </DialogBody>
      <DialogFooter actions={<Button className="primary rounded button" onClick={onConfirm} intent="primary" text="Save" />} />
    </Dialog>
    <li className={Classes.TREE_NODE} onClick={() => setOpen(true)}>
      <div className={Classes.TREE_NODE_CONTENT}>
        <span className={`${Classes.TREE_NODE_CARET_NONE} ${Classes.ICON_STANDARD}`}></span>
        <Icon icon="time" />
        &nbsp;&nbsp;
        <span className={`${Classes.TREE_NODE_LABEL}${time ? '' : ' text-gray'}`}>{time || props.time || '1s'}</span>
        <Icon icon="comparison" />
        &nbsp;&nbsp;
        <span className={`${Classes.TREE_NODE_LABEL}${memory ? '' : ' text-gray'}`}>{memory || props.memory || '256m'}</span>
        <Icon icon="star" />
        {' '}
        <span className={Classes.TREE_NODE_SECONDARY_LABEL}>{score || 0}</span>
      </div>
    </li>
    <li className={Classes.TREE_NODE} onClick={() => setDepsOpen(true)}>
      <div className={Classes.TREE_NODE_CONTENT}>
        <span className={`${Classes.TREE_NODE_CARET_NONE} ${Classes.ICON_STANDARD}`}></span>
        <Icon icon="diagram-tree" />
        &nbsp;&nbsp;
        <span className={Classes.TREE_NODE_LABEL}>{i18n('Dependencies')}: {deps.length ? deps.join(', ') : i18n('(None)')}</span>
      </div>
    </li>
    <li className={Classes.TREE_NODE}>
      <div className={Classes.TREE_NODE_CONTENT}>
        <span className={`${Classes.TREE_NODE_CARET_NONE} ${Classes.ICON_STANDARD}`}></span>
        <Icon icon="asterisk" />
        &nbsp;&nbsp;
        <span className={Classes.TREE_NODE_LABEL}>{i18n('Scoring method')}</span>
        <span className={Classes.TREE_NODE_SECONDARY_LABEL}>
          <select className="compact select" value={ctype} onChange={(e) => setType(e.target.value)}>
            <option value="min">Min</option>
            <option value="max">Max</option>
            <option value="sum">Sum</option>
          </select>
        </span>
      </div>
    </li>
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
    <Dialog title={i18n('Set time and memory limits')} icon="cog" isOpen={open} onClose={() => setOpen(false)}>
      <DialogBody>
        <ControlGroup fill={true} vertical={false}>
          <InputGroup
            leftElement={<Icon icon="time" />}
            rightElement={<Tag minimal>ms</Tag>}
            onChange={(ev) => setTime(ev.currentTarget.value ? `${ev.currentTarget.value}ms` : '')}
            placeholder="1000"
            value={ctime ? parseTimeMS(ctime, false).toString() || '' : ''}
          />
          <InputGroup
            leftElement={<Icon icon="comparison" />}
            rightElement={<Tag minimal>MB</Tag>}
            onChange={(ev) => setMemory(ev.currentTarget.value ? `${ev.currentTarget.value}MB` : '')}
            placeholder="256"
            value={cmemory ? parseMemoryMB(cmemory, false).toString() || '' : ''}
          />
        </ControlGroup>
      </DialogBody>
      <DialogFooter actions={<Button className="primary rounded button" onClick={onConfirm} intent="primary" text="Save" />} />
    </Dialog>
    <li className="bp6-tree-node" onClick={() => setOpen(true)}>
      <div className="bp6-tree-node-content">
        <Icon icon="time" />
        &nbsp;&nbsp;
        <span className={`bp6-tree-node-label${time ? '' : ' text-gray'}`}>{time || '1s'}</span>
        <Icon icon="comparison" />
        {' '}
        <span className={`bp6-tree-node-secondary-label${memory ? '' : ' text-gray'}`}>{memory || '256MB'}</span>
      </div>
    </li>
  </>);
}
