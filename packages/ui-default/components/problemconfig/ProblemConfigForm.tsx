import { Card, Switch, Text, TextInput } from '@mantine/core';
import { isEqual } from 'lodash';
import React, { useState } from 'react';
import { useDispatch, useSelector } from 'react-redux';
import { i18n } from 'vj/utils';
import FileSelectAutoComplete from '../autocomplete/components/FileSelectAutoComplete';
import LanguageSelectAutoComplete from '../autocomplete/components/LanguageSelectAutoComplete';
import { FormItem } from './BasicForm';
import ProblemType from './ProblemType';
import type { RootState } from './reducer/index';

function FileIOConfig() {
  const filename = useSelector((state: RootState) => state.config.filename);
  const dispatch = useDispatch();
  return (
    <FormItem columns={6} label="FileIOConfig" disableLabel>
      <Card withBorder style={{ padding: 10, overflow: 'visible' }}>
        <div className="row">
          <FormItem columns={12} label="FileIO">
            <TextInput
              rightSection={<Text size="sm">.in/.out</Text>}
              rightSectionWidth={100}
              rightSectionPointerEvents="none"
              value={filename || ''}
              onChange={(ev) => {
                dispatch({ type: 'problemconfig/updateFileIO', filename: ev.currentTarget.value });
              }}
              style={{ width: '100%' }}
            />
          </FormItem>
        </div>
      </Card>
    </FormItem>
  );
}

function MultiPassConfig() {
  const multiPass = useSelector((state: RootState) => state.config.multi_pass);
  const dispatch = useDispatch();
  const [enabled, setEnabled] = useState(multiPass > 1);
  return (
    <FormItem columns={6} label="Multi-pass" disableLabel>
      <Card withBorder style={{ padding: 10, overflow: 'visible' }}>
        <div className="row">
          <FormItem columns={6} label="Multi Pass">
            <Switch
              styles={{ body: { display: 'flex', height: '36px', alignItems: 'center' } }}
              checked={enabled}
              label={i18n('Enabled')}
              onChange={() => {
                setEnabled(!enabled);
                dispatch({ type: 'CONFIG_FORM_UPDATE', key: 'multi_pass', value: enabled ? 0 : 2 });
              }}
            />
          </FormItem>
          {enabled && (
            <FormItem columns={6} label={i18n('Max Passes')}>
              <TextInput
                type="number"
                min={2}
                max={10}
                value={multiPass}
                onChange={(ev) => dispatch({ type: 'CONFIG_FORM_UPDATE', key: 'multi_pass', value: +ev.currentTarget.value })}
              />
            </FormItem>
          )}
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
  return (
    <FormItem columns={12} label="ExtraFilesConfig" disableLabel>
      <Card withBorder style={{ padding: 10, overflow: 'visible' }}>
        <div className="row">
          <FormItem columns={12} label={i18n('user_extra_files')}>
            <FileSelectAutoComplete
              data={Files}
              selectedKeys={userExtraFiles}
              onChange={(val) => dispatch({ type: 'CONFIG_FORM_UPDATE', key: 'user_extra_files', value: val.split(',') })}
              multi
            />
          </FormItem>
          <FormItem columns={12} label={i18n('judge_extra_files')}>
            <FileSelectAutoComplete
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
  const dispatch = useDispatch();
  return (
    <FormItem columns={12} label="langs" disableLabel>
      <Card withBorder style={{ padding: 10, overflow: 'visible' }}>
        <div className="row">
          <FormItem columns={12} label="langs">
            <LanguageSelectAutoComplete
              placeholder={!langs.length ? i18n('Unlimited') : i18n('Code language')}
              selectedKeys={langs}
              onChange={(value) => dispatch({ type: 'CONFIG_FORM_UPDATE', key: 'langs', value: value.split(',') })}
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
      {['default', 'interactive'].includes(Type) && <MultiPassConfig />}
      {!['submit_answer', 'objective'].includes(Type) && (
        <>
          <ExtraFilesConfig />
          <LangConfig />
        </>
      )}
    </div>
  );
}
