import {
  Card, InputGroup, Tag,
} from '@blueprintjs/core';
import { isEqual } from 'lodash';
import React from 'react';
import { useDispatch, useSelector } from 'react-redux';
import { i18n } from 'vj/utils';
import CustomSelectAutoComplete from '../autocomplete/components/CustomSelectAutoComplete';
import FileSelectAutoComplete from '../autocomplete/components/FileSelectAutoComplete';
import { FormItem } from './BasicForm';
import ProblemType from './ProblemType';
import type { RootState } from './reducer/index';

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
                dispatch({ type: 'problemconfig/updateFileIO', filename: ev.currentTarget.value });
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
  const userExtraFiles = useSelector((state: RootState) => state.config.user_extra_files || [], isEqual);
  const judgeExtraFiles = useSelector((state: RootState) => state.config.judge_extra_files || [], isEqual);
  const dispatch = useDispatch();
  const userRef = React.useRef<any>();
  const judgeRef = React.useRef<any>();
  return (
    <FormItem columns={12} label="ExtraFilesConfig" disableLabel>
      <Card style={{ padding: 10 }}>
        <div className="row">
          <FormItem columns={12} label={i18n('user_extra_files')}>
            <FileSelectAutoComplete
              ref={userRef}
              data={Files}
              selectedKeys={userExtraFiles}
              onChange={(val) => dispatch({ type: 'CONFIG_FORM_UPDATE', key: 'user_extra_files', value: val.split(',') })}
              multi
            />
          </FormItem>
          <FormItem columns={12} label={i18n('judge_extra_files')}>
            <FileSelectAutoComplete
              ref={judgeRef}
              data={Files}
              selectedKeys={judgeExtraFiles}
              onChange={(val) => dispatch({ type: 'CONFIG_FORM_UPDATE', key: 'judge_extra_files', value: val.split(',') })}
              multi
            />
          </FormItem>
        </div>
      </Card>
    </FormItem>
  );
}

function LangConfig() {
  const langs = useSelector((state: RootState) => state.config.langs) || [];
  const prefixes = new Set(Object.keys(window.LANGS).filter((i) => i.includes('.')).map((i) => i.split('.')[0]));
  const data = Object.keys(window.LANGS).filter((i) => !prefixes.has(i))
    .map((i) => ({ name: `${i.includes('.') ? `${window.LANGS[i.split('.')[0]].display || ''}/` : ''}${window.LANGS[i].display}`, _id: i }));
  const dispatch = useDispatch();
  const ref = React.useRef<any>();
  const selectedKeys = langs.filter((i) => !prefixes.has(i));
  return (
    <FormItem columns={12} label="langs" disableLabel>
      <Card style={{ padding: 10 }}>
        <div className="row">
          <FormItem columns={12} label="langs">
            <CustomSelectAutoComplete
              ref={ref}
              data={data}
              placeholder={!selectedKeys.length ? i18n('Unlimited') : i18n('Code language')}
              selectedKeys={selectedKeys}
              onChange={(val) => {
                const value = val.split(',');
                value.push(...Array.from(new Set(value.filter((i) => i.includes('.')).map((i) => i.split('.')[0]))));
                dispatch({ type: 'CONFIG_FORM_UPDATE', key: 'langs', value });
              }}
              multi
            />
          </FormItem>
        </div>
      </Card>
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
          <ExtraFilesConfig />
          <LangConfig />
        </>
      )}
    </div>
  );
}
