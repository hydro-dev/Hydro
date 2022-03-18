import { Collapse } from '@blueprintjs/core';
import React from 'react';
import type { RootState } from './reducer/index';
import { connect, useDispatch, useSelector } from 'react-redux';
import i18n from 'vj/utils/i18n';

const SelectValue = {
  type: ['default', 'interactive', 'submit_answer', 'objective', 'remote_judge'],
  checker_type: ['default', 'lemon', 'syzoj', 'hustoj', 'testlib', 'strict', 'qduoj'],
  task_type: ['min', 'max', 'sum'],
}

function FormItem({ columns, label, children, help_text = '', ...props }) {
  return (
    <div {...props} className={(columns && 'medium-' + columns) + ' columns form__item'} >
      <label>
        {i18n(label)}
        {children}
        {help_text && (<p className="help-text">{i18n(help_text)}</p>)}
      </label>
    </div>
  )
}

type StringKeys<K> = {
  [T in keyof K]: K[T] extends string ? T : never;
}[keyof K];

function ManagedInput({ placeholder, key }: { placeholder: string, key: StringKeys<RootState['config']> }) {
  const value = useSelector<RootState>(state => state.config[key]);
  const dispatch = useDispatch();
  return (
    <input placeholder={i18n(placeholder)} value={value} onChange={(ev) => {
      dispatch({ type: 'CONFIG_UPDATE', key, value: ev.currentTarget.value });
    }} className="textbox" />
  )
}

function ManagedSelect({ placeholder, key }: { placeholder: string, key: keyof RootState['config'] }) {
  // 草这个never是因为 config结构没定义
  // reducers.config
  const value = useSelector<RootState>(state => state.config[key]);
  const dispatch = useDispatch();
  return (
    <select placeholder={i18n(placeholder)} value={value} onChange={(ev) => {
      dispatch({ type: 'CONFIG_UPDATE', key, value: ev.currentTarget.value });
    }} className="select">
      {SelectValue[key].map((i) => (<option value={i} key={i}>{i}</option>))}
    </select>
  )
}

function BasicInfo() {
  const checkerType = useSelector<RootState>(state => state.config.checker_type);
  return (
    <>
      <FormItem columns={6} label="Type">
        <ManagedSelect placeholder='type' key='type' />
      </FormItem>
      <FormItem columns={6} label='Filename' help_text='Fill to enabled file input and output.'>
        <ManagedInput placeholder='filename' key='filename' />
      </FormItem>
      <FormItem columns={6} label='CheckerType' help_text='Fill to enabled file input and output.'>
        <ManagedSelect placeholder='checker_type' key='checker_type' />
      </FormItem>
      <FormItem
        columns={6} label='Checker'
        style={['default', 'strict'].includes(checkerType) ? { display: 'hidden' } : {}}
      >
        <SingleFileSelect key='checker' />
      </FormItem>
      <FormItem columns={6} label='Time'>
        <ManagedInput placeholder='Time' key='time' />
      </FormItem>
      <FormItem columns={6} label="Memory">
        <ManagedInput placeholder=' Memory' key='memory' />
      </FormItem>
    </>
  )
}

function CheckerConfig() {
  return (
    <Collapse isOpen={this.showAdvanced}>
      {
        // checker can be moved to selector
        // interactor when interactor selector
      }
      <FormItem columns={6} label='checker_type'>
        <select className='select'>
          {FormValue.checker_type.map((i) => (<option value={i} key={i}>{i}</option>))}
        </select>
      </FormItem>
      <FormItem columns={6} label='checker'>
        <input name="checker" placeholder={i18n('checker')} value={this.props.config.checker} className="textbox" />
      </FormItem>
      {
        // user_extra_files {} table add to object
        // judge_extra_files {} table add to object
        // langs use tags & autocomplete window.langs
      }
    </Collapse>
  )
}

function SubtaskList() {
  return <div></div>
}

export default function ProblemConfigForm() {
  const showAdvanced = true;
  return (
    <div className="row">
      <BasicInfo />
      <CheckerConfig />
      <SubtaskList />
    </div>
  )
};
