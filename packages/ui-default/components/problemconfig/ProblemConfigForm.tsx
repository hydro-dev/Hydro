import React, { useState } from 'react';
import { useDispatch, useSelector } from 'react-redux';
import i18n from 'vj/utils/i18n';
import {
  Card, Switch, Tab, Tabs, InputGroup, Tag,
} from '@blueprintjs/core';
import type { RootState } from './reducer/index';
import CustomSelectAutoComplete from '../autocomplete/components/CustomSelectAutoComplete';
import FileSelectAutoComplete from '../autocomplete/components/FileSelectAutoComplete';
import { FormItem } from './BasicForm';
import ProblemType from './ProblemType';
import { TaskConfig } from './SubtaskTable';

function FileIOConfig() {
  const filename = useSelector((state: RootState) => state.config.filename);
  const dispatch = useDispatch();
  return (
    <FormItem columns={12} label="FileIOConfig" disableLabel>
      <Card style={{ padding: 10 }}>
        <div className="row">
          <FormItem columns={6} label="FileIO">
            <InputGroup
              rightElement={<Tag minimal>.in/.out</Tag>}
              value={filename || ''}
              onChange={(ev) => {
                dispatch({ type: 'CONFIG_FORM_UPDATE', key: 'filename', value: ev.currentTarget.value });
              }}
              fill
            />
          </FormItem>
        </div>
      </Card>
    </FormItem>
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
      <Switch checked={showTab} label={i18n('Extra Files Config')} onChange={() => setshowTab(!showTab)} />
      <div style={!showTab ? { display: 'none' } : {}}>
        <Tabs id="ExtraFilesTabs">
          <Tab
            id="user_extra_files"
            title={i18n('user_extra_files')}
            panel={(
              <FileSelectAutoComplete
                data={Files}
                selectedKeys={userExtraFiles || []}
                onChange={(val) => dispatch({ type: 'CONFIG_FORM_UPDATE', key: 'user_extra_files', value: val.split(',') })}
                multi
              />
            )}
          />
          <Tab
            id="judge_extra_files"
            title={i18n('judge_extra_files')}
            panel={(
              <FileSelectAutoComplete
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
      <Switch checked={showTab} label={i18n('Langs Config')} onChange={() => setshowTab(!showTab)} />
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

export default function ProblemConfigForm() {
  const Type = useSelector((state: RootState) => state.config.type);
  return (
    <div className="row problem-config-form">
      <ProblemType />
      {Type === 'default' && <FileIOConfig />}
      {!['submit_answer', 'objective'].includes(Type) && (
        <>
          <TaskConfig />
          <ExtraFilesConfig />
          <LangConfig />
        </>
      )}
    </div>
  );
}
