import {
  Card, InputGroup, Tab, Tabs, Tag,
} from '@blueprintjs/core';
import React from 'react';
import { useDispatch, useSelector } from 'react-redux';
import i18n from 'vj/utils/i18n';
import CustomSelectAutoComplete from '../autocomplete/components/CustomSelectAutoComplete';
import FileSelectAutoComplete from '../autocomplete/components/FileSelectAutoComplete';
import { FormItem } from './BasicForm';
import ProblemType from './ProblemType';
import type { RootState } from './reducer/index';
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
  const Files = useSelector((state: RootState) => state.testdata);
  const userExtraFiles = useSelector((state: RootState) => state.config.user_extra_files) || [];
  const judgeExtraFiles = useSelector((state: RootState) => state.config.judge_extra_files) || [];
  const dispatch = useDispatch();
  const userRef = React.useRef<any>();
  const judgeRef = React.useRef<any>();
  React.useEffect(() => {
    userRef.current.setSelectedKeys(userExtraFiles);
  }, [JSON.stringify(userExtraFiles)]);
  React.useEffect(() => {
    judgeRef.current.setSelectedKeys(judgeExtraFiles);
  }, [JSON.stringify(judgeExtraFiles)]);
  return (
    <FormItem columns={12} label="ExtraFilesTabs" disableLabel>
      <Tabs id="ExtraFilesTabs">
        <Tab
          id="user_extra_files"
          title={i18n('user_extra_files')}
          panel={(
            <FileSelectAutoComplete
              ref={userRef}
              data={Files}
              selectedKeys={userExtraFiles}
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
              ref={judgeRef}
              data={Files}
              selectedKeys={judgeExtraFiles}
              onChange={(val) => dispatch({ type: 'CONFIG_FORM_UPDATE', key: 'judge_extra_files', value: val.split(',') })}
              multi
            />
          )}
        />
      </Tabs>
    </FormItem>
  );
}

function LangConfig() {
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
    <FormItem columns={12} label="langs">
      <CustomSelectAutoComplete
        ref={ref}
        data={data}
        placeholder={i18n('Unlimited')}
        selectedKeys={selectedKeys}
        onChange={(val) => {
          const value = val.split(',');
          value.push(...Array.from(new Set(value.filter((i) => i.includes('.')).map((i) => i.split('.')[0]))));
          dispatch({ type: 'CONFIG_FORM_UPDATE', key: 'langs', value });
        }}
        multi
      />
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
