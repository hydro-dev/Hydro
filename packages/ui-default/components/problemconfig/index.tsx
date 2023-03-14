import { Tab, Tabs } from '@blueprintjs/core';
import React from 'react';
import { useSelector } from 'react-redux';
import { i18n } from 'vj/utils';
import ProblemConfigEditor from './ProblemConfigEditor';
import ProblemConfigForm from './ProblemConfigForm';
import { ProblemConfigTree } from './ProblemConfigTree';
import { RootState } from './reducer';

interface Props {
  onSave: () => void
}

export default function ProblemConfig(props: Props) {
  const [selected, setSelected] = React.useState('basic');
  const valid = useSelector((state: RootState) => state.config.__valid);
  const errors = useSelector((state: RootState) => state.config.__errors, (a, b) => JSON.stringify(a) === JSON.stringify(b));

  return (<>
    <div className="row">
      <div className="medium-4 columns">
        <ProblemConfigEditor />
      </div>
      <div className="medium-8 columns">
        <Tabs onChange={(t) => (t !== 'errors' && setSelected(t.toString()))} selectedTabId={valid ? selected : 'errors'}>
          <Tab id="basic" title="Basic" panel={<ProblemConfigForm />} />
          <Tab id="subtasks" title="Subtasks" panel={<ProblemConfigTree />} />
          <Tab id="errors" hidden title="Errors" panel={valid
            ? <div>No errors</div>
            : <div>{errors.map((i) => (<pre>{i}</pre>))}</div>} />
        </Tabs>
      </div>
    </div>
    <button className={`rounded primary button${valid ? '' : ' disabled'}`} disabled={!valid} onClick={props.onSave}>{i18n('Submit')}</button>
  </>);
}
