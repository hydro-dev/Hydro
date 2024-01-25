import React from 'react';
import { useDispatch, useSelector } from 'react-redux';
import { i18n } from 'vj/utils';
import FileSelectAutoComplete from '../autocomplete/components/FileSelectAutoComplete';
import type { RootState } from './reducer/index';

export function FormItem({
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

export function ManagedInput({ placeholder, formKey }: { placeholder?: string, formKey: KeyType<RootState['config']> }) {
  const value = useSelector((state: RootState) => state.config[formKey]);
  const dispatch = useDispatch();
  return (
    <input
      placeholder={i18n(placeholder)}
      value={value || ''}
      type={typeof value === 'number' ? 'number' : 'text'}
      onChange={(ev) => {
        dispatch({ type: 'CONFIG_FORM_UPDATE', key: formKey, value: ev.currentTarget.value });
      }}
      className="textbox"
    />
  );
}

export function ManagedSelect({ options, formKey }: { options: string[], formKey: KeyType<RootState['config']> }) {
  const value = useSelector((state: RootState) => state.config[formKey]);
  const dispatch = useDispatch();
  return (
    <select
      value={value || ''}
      onChange={(ev) => {
        dispatch({ type: 'CONFIG_FORM_UPDATE', key: formKey, value: ev.currentTarget.value });
      }}
      className="select"
    >
      {options.map((o) => (<option id={o} key={o}>{o}</option>))}
    </select>
  );
}

export function SingleFileSelect({ formKey }: { formKey: KeyType<RootState['config']> }) {
  const value = useSelector((state: RootState) => state.config[formKey]);
  const Files = useSelector((state: RootState) => state.testdata);
  const dispatch = useDispatch();
  return (
    <FileSelectAutoComplete
      width="100%"
      data={Files}
      selectedKeys={[value]}
      onChange={(val) => dispatch({ type: 'CONFIG_FORM_UPDATE', key: formKey, value: val })}
    />
  );
}
