import React from 'react';
import { i18n } from 'vj/utils';
import ProblemConfigEditor from './ProblemConfigEditor';
import ProblemConfigForm from './ProblemConfigForm';
import { ProblemConfigTree } from './ProblemConfigTree';

interface Props {
  onSave: () => void
}

export default function ProblemConfig(props: Props) {
  return (<>
    <div className="row">
      <div className="medium-5 columns">
        <ProblemConfigTree />
        <ProblemConfigEditor />
      </div>
      <div className="medium-7 columns">
        <ProblemConfigForm />
      </div>
    </div>
    <button className="rounded primary button" onClick={props.onSave}>{i18n('Submit')}</button>
  </>);
}
