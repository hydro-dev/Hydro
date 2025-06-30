import {
  Card, Classes, Switch, Tab, Tabs, TabsExpander,
} from '@blueprintjs/core';
import React, { useEffect } from 'react';
import { useDispatch, useSelector } from 'react-redux';
import { i18n } from 'vj/utils';
import { testlibCheckers } from '../monaco/schema/problemconfig';
import { FormItem, ManagedSelect, SingleFileSelect } from './BasicForm';
import type { RootState } from './reducer/index';

export default function ProblemType() {
  const Type = useSelector((state: RootState) => state.config.type);
  const checkerType = useSelector((state: RootState) => state.config.checker_type);
  const filename = useSelector((state: RootState) => state.config.filename);
  const numProcesses = useSelector((state: RootState) => state.config.num_processes);
  const subType = useSelector((state: RootState) => state.config.subType);
  const checker = useSelector((state: RootState) => state.config.checker);
  const [category, setCategory] = React.useState('');
  const dispatch = useDispatch();
  const dispatcher = (base) => (value) => dispatch({ ...base, value });
  useEffect(() => {
    if (category || !checker) return;
    const name = typeof checker === 'string' ? checker : checker.file;
    if (name.includes('.')) setCategory('custom');
    else setCategory('preset');
  }, [checker]);
  return (
    <FormItem columns={12} label="" disableLabel>
      <Card style={{ padding: 10 }}>
        <Tabs
          id="ProblemTypeTabs"
          selectedTabId={Type}
          onChange={dispatcher({ type: 'CONFIG_FORM_UPDATE', key: 'type' })}
          defaultSelectedTabId="default"
          renderActiveTabPanelOnly
        >
          <span className={Classes.TAB}>{i18n('Problem Type')}</span>
          <TabsExpander />
          <Tab
            id="default"
            title={i18n('problem_type.default')}
            panel={(
              <Tabs
                id="CheckerTypeTabs"
                selectedTabId={
                  ['strict', 'default'].includes(checkerType) || !checkerType
                    ? 'default' : (checkerType !== 'testlib' ? 'other' : 'testlib')
                }
                onChange={(value) => {
                  dispatch({ type: 'CONFIG_FORM_UPDATE', key: 'checker_type', value });
                  if (value === 'testlib' && !category) setCategory('custom');
                }}
                renderActiveTabPanelOnly
              >
                <span className={Classes.TAB}>{i18n('CheckerType')}</span>
                <TabsExpander />
                <Tab
                  id="default"
                  title={i18n('default')}
                  panel={(
                    <div className="row">
                      <FormItem columns={12} label="Config">
                        <Switch
                          checked={checkerType !== 'strict'}
                          label={i18n('Ignore trailing space and enter.')}
                          onChange={() => {
                            dispatch({ type: 'CONFIG_FORM_UPDATE', key: 'checker_type', value: checkerType === 'strict' ? 'default' : 'strict' });
                          }}
                        />
                      </FormItem>
                    </div>
                  )}
                />
                <Tab
                  id="testlib"
                  title="testlib"
                  panel={(
                    <div className="row">
                      <FormItem columns={4} label="Type">
                        <select
                          value={category}
                          onChange={(ev) => {
                            setCategory(ev.currentTarget.value);
                            dispatch({ type: 'CONFIG_FORM_UPDATE', key: 'checker', value: ev.currentTarget.value === 'preset' ? 'acmp' : null });
                          }}
                          className="select"
                        >
                          <option value="preset">{i18n('Preset')}</option>
                          <option value="custom">{i18n('Custom')}</option>
                        </select>
                      </FormItem>
                      {category === 'preset'
                        ? <FormItem columns={8} label="Checker">
                          <select
                            value={typeof checker === 'string' ? checker : checker.file}
                            onChange={(ev) => dispatch({ type: 'CONFIG_FORM_UPDATE', key: 'checker', value: ev.currentTarget.value })}
                            className="select"
                          >
                            {testlibCheckers.map((c) => (
                              <option key={c} value={c}>{c}</option>
                            ))}
                          </select>
                        </FormItem>
                        : <SingleFileSelect formKey="checker" label="Checker" withLang />}
                    </div>
                  )}
                />
                <Tab
                  id="other"
                  title="other"
                  panel={(
                    <div className="row">
                      <FormItem columns={4} label="Interface">
                        <ManagedSelect options={['syzoj', 'hustoj', 'qduoj', 'lemon', 'kattis']} formKey="checker_type" />
                      </FormItem>
                      <SingleFileSelect formKey="checker" label="Checker" withLang />
                    </div>
                  )}
                />
              </Tabs>
            )}
          />
          <Tab
            id="interactive"
            title={i18n('problem_type.interactive')}
            panel={(
              <div className="row">
                <SingleFileSelect formKey="interactor" label="Interactor" withLang />
              </div>
            )}
          />
          <Tab
            id="communication"
            title={i18n('problem_type.communication')}
            panel={(
              <div className="row">
                <SingleFileSelect formKey="manager" label="Manager" withLang />
                <FormItem columns={4} label="Number of Processes">
                  <input
                    defaultValue={numProcesses || 2}
                    placeholder="2"
                    onChange={(ev) => dispatch(({ type: 'CONFIG_FORM_UPDATE', key: 'num_processes', value: +ev.currentTarget.value }))}
                    className="textbox"
                  />
                </FormItem>
              </div>
            )}
          />
          <Tab
            id="submit_answer"
            title={i18n('problem_type.submit_answer')}
            panel={(
              <div className="row">
                <FormItem columns={6} label="Config" disableLabel>
                  <Switch
                    checked={subType === 'multi'}
                    label={i18n('Multi-file')}
                    onChange={() => {
                      dispatch({ type: 'CONFIG_FORM_UPDATE', key: 'subType', value: subType === 'multi' ? 'single' : 'multi' });
                    }}
                  />
                </FormItem>
                <FormItem columns={6} label="Filename">
                  <input
                    defaultValue={filename || '#.txt'}
                    placeholder="#.txt"
                    disabled={subType !== 'multi'}
                    onChange={(ev) => dispatch(({ type: 'CONFIG_FORM_UPDATE', key: 'filename', value: ev.currentTarget.value }))}
                    className="textbox"
                  />
                </FormItem>
              </div>
            )}
          />
          <Tab
            id="objective"
            title={i18n('problem_type.objective')}
            panel={(<p>{i18n('Unsupported configure this type of problem. Please refer to the documentation.')}</p>)}
          />
        </Tabs>
      </Card>
    </FormItem>
  );
}
