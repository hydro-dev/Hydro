import React from 'react';
import { useDispatch, useSelector } from 'react-redux';
import { i18n } from 'vj/utils';
import CustomSelectAutoComplete from '../autocomplete/components/CustomSelectAutoComplete';
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
type FileSelectKey = 'checker' | 'interactor' | 'manager';

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

const prefixes = new Set(Object.keys(window.LANGS).filter((i) => i.includes('.')).map((i) => i.split('.')[0]));
const data = Object.keys(window.LANGS).filter((i) => !prefixes.has(i))
  .map((i) => ({ name: `${i.includes('.') ? `${window.LANGS[i.split('.')[0]].display || ''}/` : ''}${window.LANGS[i].display}`, _id: i }));
data.unshift({ name: 'Auto', _id: 'auto' });

export function SingleFileSelect({ formKey, withLang = false, label = 'Checker' }: { formKey: FileSelectKey, withLang?: boolean, label?: string }) {
  const value = useSelector((state: RootState) => state.config[formKey]);
  const Files = useSelector((state: RootState) => state.testdata);
  const dispatch = useDispatch();
  const selectedFile = typeof value === 'string' ? value : value?.file || '';
  const selectedLang = typeof value === 'string' ? 'auto' : value?.lang || 'auto';
  const update = (file: string, lang: string) => {
    if (file === selectedFile && lang === selectedLang) return;
    if (withLang) dispatch({ type: 'CONFIG_FORM_UPDATE', key: formKey, value: file ? { file, lang } : null });
    else dispatch({ type: 'CONFIG_FORM_UPDATE', key: formKey, value: file });
  };
  return withLang ? (<>
    <FormItem columns={5} label={label}>
      <FileSelectAutoComplete
        width="100%"
        data={Files}
        selectedKeys={[selectedFile]}
        onChange={(val) => update(val, selectedLang)}
      />
    </FormItem>
    <FormItem columns={3} label="Language">
      <CustomSelectAutoComplete
        data={data}
        selectedKeys={[selectedLang]}
        onChange={(val) => update(selectedFile, val)}
      />
    </FormItem>
  </>) : (<FileSelectAutoComplete
    width="100%"
    data={Files}
    selectedKeys={[selectedFile]}
    onChange={(val) => update(val, selectedLang)}
  />);
}
