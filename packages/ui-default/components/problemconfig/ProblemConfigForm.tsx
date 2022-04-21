import React, { useState } from 'react';
import { useDispatch, useSelector } from 'react-redux';
import i18n from 'vj/utils/i18n';
import { isEqual } from 'lodash';
import { Switch, Tab, Tabs } from '@blueprintjs/core';
import type { SubtaskConfig, TestCaseConfig } from 'hydrooj/src/interface';
import type { RootState } from './reducer/index';
import CustomSelectAutoComplete from '../autocomplete/components/CustomSelectAutoComplete';

const SelectValue = {
  type: ['default', 'interactive', 'submit_answer', 'objective'],
  checker_type: ['default', 'lemon', 'syzoj', 'hustoj', 'testlib', 'qduoj'],
  task_type: ['min', 'max', 'sum'],
};

const eq = (a: SubtaskConfig, b: SubtaskConfig) => isEqual(a, b) && !isEqual(a.cases, b.cases);
const eq1 = (a: TestCaseConfig, b: TestCaseConfig) => isEqual(a, b);
const eqId = (a: SubtaskConfig[], b: SubtaskConfig[]) => {
  if (a.length !== b.length) return true;
  for (let i = 0; i < a.length; i++) {
    if (a[i].id !== b[i].id) return true;
  }
  return false;
};

function FormItem({
  columns, label, children, helpText = '', disableLabel = false, ...props
}) {
  return (
    <div {...props} className={`${columns && `medium-${columns}`} columns form__item`}>
      <label htmlFor={`${label}-form`}>
        {!disableLabel && i18n(label)}
        {children}
        {helpText && (<p className="help-text">{i18n(helpText)}</p>)}
      </label>
    </div>
  );
}

type KeyType<K, T = string | number> = {
  [Q in keyof K]: K[Q] extends T ? Q : never;
}[keyof K];

function ManagedInput({ placeholder, formKey }: { placeholder: string, formKey: KeyType<RootState['config']> }) {
  const value = useSelector((state: RootState) => state.config[formKey]);
  const dispatch = useDispatch();
  return (
    <input
      placeholder={i18n(placeholder)}
      value={value || ''}
      onChange={(ev) => {
        dispatch({ type: 'CONFIG_FORM_UPDATE', key: formKey, value: ev.currentTarget.value });
      }}
      className="textbox"
    />
  );
}

function ManagedSelect({ placeholder, formKey }: { placeholder: string, formKey: KeyType<RootState['config']> }) {
  const value = useSelector((state: RootState) => state.config[formKey]);
  const dispatch = useDispatch();
  return (
    <select
      placeholder={i18n(placeholder)}
      value={value || ''}
      onChange={(ev) => {
        dispatch({ type: 'CONFIG_FORM_UPDATE', key: formKey, value: ev.currentTarget.value });
      }}
      className="select"
    >
      {SelectValue[formKey].map((i) => (<option value={i} key={i}>{i}</option>))}
    </select>
  );
}

function SingleFileSelect({ formKey }: { formKey: KeyType<RootState['config']> }) {
  const value = useSelector((state: RootState) => state.config[formKey]);
  const Files = useSelector((state: RootState) => state.testdata);
  const dispatch = useDispatch();
  return (
    <CustomSelectAutoComplete
      width="100%"
      data={Files}
      selectedKeys={[value]}
      onChange={(val) => dispatch({ type: 'CONFIG_FORM_UPDATE', key: formKey, value: val })}
    />
  );
}

function BasicInfo() {
  const Type = useSelector((state: RootState) => state.config.type);
  const checkerType = useSelector((state: RootState) => state.config.checker_type);
  const dispatch = useDispatch();
  return (
    <>
      <FormItem columns={6} label="Type">
        <ManagedSelect placeholder="type" formKey="type" />
      </FormItem>
      <FormItem columns={6} label="Filename" style={Type === 'interactive' ? { display: 'none' } : {}}>
        <ManagedInput placeholder="filename" formKey="filename" />
      </FormItem>
      <FormItem
        columns={12}
        label="CheckerType"
        disableLabel
        style={Type !== 'default' ? { display: 'none' } : {}}
      >
        <Tabs
          id="CheckerTypeTabs"
          selectedTabId={checkerType !== 'strict' ? checkerType : 'default'}
          onChange={(value) => {
            dispatch({ type: 'CONFIG_FORM_UPDATE', key: 'checker_type', value });
          }}
          renderActiveTabPanelOnly
        >
          <span>{i18n('CheckerType')}</span>
          <Tabs.Expander />
          {
            SelectValue.checker_type.map((i) => (
              <Tab
                id={i}
                title={i}
                key={i}
                panel={(
                  <FormItem columns={12} label="Checker">
                    {['default', 'strict'].includes(i)
                      ? (
                        <Switch
                          checked={checkerType === 'strict'}
                          label="Don't ignore space and enter."
                          onChange={
                            () => {
                              dispatch({ type: 'CONFIG_FORM_UPDATE', key: 'checker_type', value: checkerType === 'strict' ? 'default' : 'strict' });
                            }
                          }
                        />
                      )
                      : (
                        <SingleFileSelect formKey="checker" />
                      )}
                  </FormItem>
                )}
              />
            ))
          }
        </Tabs>
      </FormItem>
      <FormItem columns={6} label="Interactor" style={Type !== 'interactive' ? { display: 'none' } : {}}>
        <SingleFileSelect formKey="interactor" />
      </FormItem>
    </>
  );
}

function ExtraFilesConfig() {
  const [showTab, setshowTab] = useState(false);
  const Files = useSelector((state: RootState) => state.testdata);
  const userExtraFiles = useSelector((state: RootState) => state.config.user_extra_files);
  const judgeExtraFiles = useSelector((state: RootState) => state.config.judge_extra_files);
  const dispatch = useDispatch();
  return (
    <FormItem columns={12} label="ExtraFilesTabs" disableLabel>
      <Switch checked={showTab} label="Extra Files Config" onChange={() => setshowTab(!showTab)} />
      <div style={!showTab ? { display: 'none' } : {}}>
        <Tabs id="ExtraFilesTabs">
          <Tab
            id="user_extra_files"
            title="user_extra_files"
            panel={(
              <CustomSelectAutoComplete
                data={Files}
                selectedKeys={userExtraFiles || []}
                onChange={(val) => dispatch({ type: 'CONFIG_FORM_UPDATE', key: 'user_extra_files', value: val.split(',') })}
                multi
              />
            )}
          />
          <Tab
            id="judge_extra_files"
            title="judge_extra_files"
            panel={(
              <CustomSelectAutoComplete
                data={Files}
                selectedKeys={judgeExtraFiles || []}
                onChange={(val) => dispatch({ type: 'CONFIG_FORM_UPDATE', key: 'judge_extra_files', value: val.split(',') })}
                multi
              />
            )}
          />
        </Tabs>
      </div>
    </FormItem>
  );
}

function CasesSubCasesTable({ index, subindex }) {
  const subcases = useSelector((state: RootState) => (index === -1
    ? state.config.cases[subindex] : state.config.subtasks[index].cases[subindex]), eq1);
  const Files = useSelector((state: RootState) => state.testdata);
  const dispatch = useDispatch();
  const dispatcher = (casesKey: string): React.ChangeEventHandler<HTMLInputElement | HTMLSelectElement> => (ev) => {
    dispatch({
      type: index === -1 ? 'CONFIG_CASES_UPDATE' : 'CONFIG_SUBTASK_UPDATE',
      id: index,
      key: 'cases-edit',
      casesId: subindex,
      casesKey,
      value: ev.currentTarget.value,
    });
  };
  const dispatcher1 = (casesKey: string): React.ChangeEventHandler<HTMLInputElement | HTMLSelectElement> => (val) => {
    dispatch({
      type: index === -1 ? 'CONFIG_CASES_UPDATE' : 'CONFIG_SUBTASK_UPDATE',
      id: index,
      key: 'cases-edit',
      casesId: subindex,
      casesKey,
      value: val,
    });
  };
  return (
    <tr>
      {
        index === -1 && (
          <>
            <td>
              <input
                value={subcases.time || ''}
                onChange={dispatcher('time')}
                className="textbox"
              />
            </td>
            <td>
              <input
                value={subcases.memory || ''}
                onChange={dispatcher('memory')}
                className="textbox"
              />
            </td>
          </>
        )
      }
      <td>
        <CustomSelectAutoComplete
          width="100%"
          data={Files}
          selectedKeys={[subcases.input]}
          onChange={dispatcher1('input')}
        />
      </td>
      <td>
        <CustomSelectAutoComplete
          width="100%"
          data={Files}
          selectedKeys={[subcases.output]}
          onChange={dispatcher1('output')}
        />
      </td>
      <td>
        <a
          onClick={() => dispatch({
            type: index === -1 ? 'CONFIG_CASES_UPDATE' : 'CONFIG_SUBTASK_UPDATE', id: index, key: 'cases-delete', value: subindex,
          })}
        ><span className="icon icon-close"></span>
        </a>
      </td>
    </tr>
  );
}

function CasesTable({ index }) {
  const casesLength = useSelector((state: RootState) => (index === -1 ? state.config.cases?.length : state.config.subtasks[index].cases?.length));
  const dispatch = useDispatch();
  return (
    <table className="data-table">
      <thead>
        <tr>
          {
            index === -1 && (
              <>
                <th>
                  {i18n('Time')}
                </th>
                <th>
                  {i18n('Memory')}
                </th>
              </>
            )
          }
          <th>
            {i18n('Input')}
          </th>
          <th>
            {i18n('Output')}
          </th>
          <th className="col--operation">
            <a
              onClick={() => dispatch({
                type: index === -1 ? 'CONFIG_CASES_UPDATE' : 'CONFIG_SUBTASK_UPDATE',
                id: index,
                key: 'cases-add',
                value: index === -1 ? {
                  time: 1000, memory: 256, input: '', output: '',
                } : { input: '', output: '' },
              })}
            ><span className="icon icon-add" />
            </a>
          </th>
        </tr>
      </thead>
      <tbody>
        {casesLength && [...Array(casesLength).keys()].map((i) => <CasesSubCasesTable index={index} subindex={i} key={i} />)}
      </tbody>
    </table>
  );
}

function SubtasksIds({ index }) {
  const subtasks = useSelector((state: RootState) => state.config.subtasks, eqId);
  const subtaskIf = useSelector((state: RootState) => state.config.subtasks[index].if);
  const dispatch = useDispatch();
  const subtasksIds = subtasks.map((i) => i.id && i.id).filter((i) => i !== undefined);
  return (
    <tr>
      <td>if</td>
      <td colSpan={4}>
        <CustomSelectAutoComplete
          data={subtasksIds}
          selectedKeys={subtaskIf?.join(',').split(',') || []}
          itemKey={(item) => `${item}`}
          onChange={(val) => dispatch({
            type: 'CONFIG_SUBTASK_UPDATE', id: index, key: 'if', value: val.split(','),
          })}
          multi
        />
      </td>
    </tr>
  );
}

function SubtasksTable({ index }) {
  const subtask = useSelector((state: RootState) => state.config.subtasks[index], eq);
  const dispatch = useDispatch();
  const dispatcher = (key: string): React.ChangeEventHandler<HTMLInputElement | HTMLSelectElement> => (ev) => {
    dispatch({
      type: 'CONFIG_SUBTASK_UPDATE', id: index, key, value: ev.currentTarget.value,
    });
  };
  return (
    <>
      <span>Subtasks #{index + 1} </span>
      <a onClick={() => { dispatch({ type: 'CONFIG_SUBTASK_UPDATE', id: index, key: 'add' }); }}><span className="icon icon-add"></span></a>
      <a
        style={index === 0 ? { display: 'none' } : {}}
        onClick={() => { dispatch({ type: 'CONFIG_SUBTASK_UPDATE', id: index, key: 'delete' }); }}
      ><span className="icon icon-delete"></span>
      </a>
      <table className="data-table">
        <thead>
          <tr>
            <th>#</th>
            <th>Score</th>
            <th>Type</th>
            <th>Time</th>
            <th>Memory</th>
          </tr>
        </thead>
        <tbody>
          <tr>
            <td>
              <input
                value={subtask.id || ''}
                onChange={dispatcher('id')}
                className="textbox"
              />
            </td>
            <td>
              <input
                value={subtask.score || ''}
                onChange={dispatcher('score')}
                className="textbox"
              />
            </td>
            <td>
              <select
                value={subtask.type}
                onChange={dispatcher('type')}
                className="select"
              >
                <option aria-label="null" value="" style={{ display: 'none' }}></option>
                {SelectValue.task_type.map((i) => (<option value={i} key={i}>{i}</option>))}
              </select>
            </td>
            <td>
              <input
                value={subtask.time || ''}
                onChange={dispatcher('time')}
                className="textbox"
              />
            </td>
            <td>
              <input
                value={subtask.memory || ''}
                onChange={dispatcher('memory')}
                className="textbox"
              />
            </td>
          </tr>
          <SubtasksIds index={index} />
        </tbody>
      </table>
      <CasesTable index={index} />
    </>
  );
}

function TaskConfig({ onAutoLoad }) {
  const subtasksLength = useSelector((state: RootState) => state.config.subtasks?.length);
  const casesLength = useSelector((state: RootState) => state.config.cases?.length);
  const dispatch = useDispatch();
  return (
    <FormItem columns={12} label="Task Settings">
      <div className="row">
        <FormItem columns={4} label="Time">
          <ManagedInput placeholder="Time" formKey="time" />
        </FormItem>
        <FormItem columns={4} label="Memory">
          <ManagedInput placeholder="Memory" formKey="memory" />
        </FormItem>
        <FormItem columns={4} label="Score">
          <ManagedInput placeholder="Score" formKey="score" />
        </FormItem>
        <FormItem columns={12} label="Cases Settings" disableLabel>
          {casesLength && <Switch label="Use Subtasks" onChange={() => dispatch({ type: 'CONFIG_SUBTASKS_SWITCH', value: true })} />}
          {
            subtasksLength || casesLength
              ? subtasksLength && [...Array(subtasksLength).keys()].map((i) => <SubtasksTable index={i} key={i} />)
              || casesLength && (<CasesTable index={-1} />)
              : (
                <a onClick={() => onAutoLoad()}>
                  <span className="icon icon-settings"> {i18n('Auto Read Tasks')}</span>
                </a>
              )
          }
        </FormItem>
      </div>
    </FormItem>
  );
}

function LangConfig() {
  const [showTab, setshowTab] = useState(false);
  const langs = useSelector((state: RootState) => state.config.langs) || [];
  const prefixes = new Set(Object.keys(LANGS).filter((i) => i.includes('.')).map((i) => i.split('.')[0]));
  const data = Object.keys(LANGS).filter((i) => !prefixes.has(i))
    .map((i) => ({ name: LANGS[i].display, _id: i }));
  const dispatch = useDispatch();
  const ref = React.useRef<any>();
  const selectedKeys = langs.filter((i) => !prefixes.has(i));
  React.useEffect(() => {
    ref.current.setSelectedKeys(selectedKeys);
  }, [JSON.stringify(selectedKeys)]);
  return (
    <FormItem columns={12} label="LangsTabs" disableLabel>
      <Switch checked={showTab} label="Langs Config" onChange={() => setshowTab(!showTab)} />
      <FormItem columns={12} label="langs" style={!showTab ? { display: 'none' } : {}}>
        <CustomSelectAutoComplete
          ref={ref}
          data={data}
          selectedKeys={selectedKeys}
          onChange={(val) => {
            const value = val.split(',');
            value.push(...Array.from(new Set(value.filter((i) => i.includes('.')).map((i) => i.split('.')[0]))));
            dispatch({ type: 'CONFIG_FORM_UPDATE', key: 'langs', value });
          }}
          multi
        />
      </FormItem>
    </FormItem>
  );
}

export default function ProblemConfigForm({ onAutoLoad }) {
  return (
    <div className="row">
      <BasicInfo />
      <TaskConfig onAutoLoad={onAutoLoad} />
      <ExtraFilesConfig />
      <LangConfig />
    </div>
  );
}
