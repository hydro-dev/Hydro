import {
  Button, Dialog, DialogBody, DialogFooter, Tab, Tabs,
} from '@blueprintjs/core';
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

  return (<>
    <div className="row">
      <div className="medium-4 columns">
        <ProblemConfigEditor />
      </div>
      <div className="medium-8 columns">
        <Tabs onChange={(t) => (t !== 'errors' && setSelected(t.toString()))} selectedTabId={valid ? selected : 'errors'}>
          <Tab id="basic" disabled={!valid} title={i18n('Basic')} panel={<ProblemConfigForm />} />
          <Tab id="subtasks" disabled={!valid} title={i18n('Subtasks')} panel={<ProblemConfigTree />} />
          <Tab
            id="errors"
            disabled={valid}
            title={errors.length ? `Errors(${errors.length})` : 'No Errors'}
            panel={<div>{errors.map((i) => (<pre key={i}>{i}</pre>))}</div>}
          />
        </Tabs>
      </div>
    </div>
    <Dialog isOpen={open && !valid} onClose={() => setOpen(false)}>
      <DialogBody>
        <p>{i18n('Errors detected in the config. Confirm save?')}</p>
      </DialogBody>
      <DialogFooter actions={<>
        <Button onClick={() => setOpen(false)}>{i18n('Cancel')}</Button>
        <Button intent="warning" onClick={props.onSave}>{i18n('Save')}</Button>
      </>} />
    </Dialog>
    <button className="rounded primary button" onClick={valid ? props.onSave : () => setOpen(true)}>{i18n('Save')}</button>
  </>);
}
