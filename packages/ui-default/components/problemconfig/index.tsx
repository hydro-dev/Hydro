import { Button, Modal, Tabs } from '@mantine/core';
import { ContextMenuProvider } from 'mantine-contextmenu';
import React from 'react';
import { useSelector } from 'react-redux';
import { i18n } from 'vj/utils';
import ProblemConfigEditor from './ProblemConfigEditor';
import ProblemConfigForm from './ProblemConfigForm';
import { ProblemConfigTree } from './ProblemConfigTree';
import { RootState } from './reducer';

interface Props {
  onSave: () => void;
}

export default function ProblemConfig(props: Props) {
  const [selected, setSelected] = React.useState('basic');
  const [open, setOpen] = React.useState(false);
  const valid = useSelector((state: RootState) => state.config.__valid);
  const errors = useSelector((state: RootState) => state.config.__errors, (a, b) => JSON.stringify(a) === JSON.stringify(b));
  React.useEffect(() => {
    if (valid) setOpen(false);
  }, [valid]);

  return (<ContextMenuProvider>
    <div className="row">
      <div className="medium-4 columns">
        <ProblemConfigEditor />
      </div>
      <div className="medium-8 columns">
        <Tabs value={valid ? selected : 'errors'} keepMounted={false} onChange={(t) => (t !== 'errors' && t && setSelected(t.toString()))}>
          <Tabs.List>
            <Tabs.Tab value="basic" disabled={!valid}>{i18n('Basic')}</Tabs.Tab>
            <Tabs.Tab value="subtasks" disabled={!valid}>{i18n('Subtasks')}</Tabs.Tab>
            <Tabs.Tab value="errors" disabled={valid}>{errors.length ? `Errors(${errors.length})` : 'No Errors'}</Tabs.Tab>
          </Tabs.List>
          <Tabs.Panel value="basic">
            <ProblemConfigForm />
          </Tabs.Panel>
          <Tabs.Panel value="subtasks">
            <ProblemConfigTree />
          </Tabs.Panel>
          <Tabs.Panel value="errors">
            <div>{errors.map((i) => (<pre key={i}>{i}</pre>))}</div>
          </Tabs.Panel>
        </Tabs>
      </div>
    </div>
    <Modal opened={open && !valid} onClose={() => setOpen(false)}>
      <p>{i18n('Errors detected in the config. Confirm save?')}</p>
      <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 8 }}>
        <Button variant="default" onClick={() => setOpen(false)}>{i18n('Cancel')}</Button>
        <Button color="yellow" onClick={props.onSave}>{i18n('Save')}</Button>
      </div>
    </Modal>
    <button className="rounded primary button" onClick={valid ? props.onSave : () => setOpen(true)}>{i18n('Save')}</button>
  </ContextMenuProvider>);
}
