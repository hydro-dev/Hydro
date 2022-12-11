import { NumericInput, Tag } from '@blueprintjs/core';
import { parseMemoryMB, parseTimeMS } from '@hydrooj/utils/lib/common';
import type { SubtaskConfig } from 'hydrooj/src/interface';
import { isEqual } from 'lodash';
import React, { useEffect, useRef } from 'react';
import { useDispatch, useSelector } from 'react-redux';
import { i18n } from 'vj/utils';
import FileSelectAutoComplete from '../autocomplete/components/FileSelectAutoComplete';
import type { RootState } from './reducer/index';

const eq = (a: SubtaskConfig, b: SubtaskConfig) => isEqual(a, b);
const eqArr = (a: any[], b: any[]) => isEqual(a, b);

export function TestCaseEntry({ index, subindex }) {
  const testcase = useSelector((state: RootState) => state.config.subtasks[index].cases[subindex], eq);
  const Files = useSelector((state: RootState) => state.testdata, eqArr);
  const defaultTime = useSelector((state: RootState) => state.config.subtasks[index].time || state.config.time);
  const defaultMemory = useSelector((state: RootState) => state.config.subtasks[index].memory || state.config.memory);
  const dispatch = useDispatch();
  const dispatcher = (casesKey: string, valueSuffix = '') => (ev: React.ChangeEvent<HTMLInputElement | HTMLSelectElement> | number) => {
    let value = typeof ev !== 'object' ? ev : ev.currentTarget.value;
    if (value === 0) value = '';
    if (valueSuffix && value) value += valueSuffix;
    dispatch({
      type: 'CONFIG_SUBTASK_UPDATE',
      id: index,
      key: 'cases-edit',
      casesId: subindex,
      casesKey,
      value,
    });
    if ((casesKey === 'input' && (value as string).endsWith('.in') && !testcase.output)
      || (casesKey === 'output' && (value as string).endsWith('.out') && !testcase.input)) {
      const filename = (value as string).substring(0, (value as string).lastIndexOf('.'));
      if (!testcase.output && (Files.map((f) => f.name).includes(`${filename}.out`) || Files.map((f) => f.name).includes(`${filename}.ans`))) {
        dispatch({
          type: 'CONFIG_SUBTASK_UPDATE',
          id: index,
          key: 'cases-edit',
          casesId: subindex,
          casesKey: 'output',
          value: Files.map((f) => f.name).includes(`${filename}.out`) ? `${filename}.out` : `${filename}.ans`,
        });
      }
      if (!testcase.input && Files.map((f) => f.name).includes(`${filename}.in`)) {
        dispatch({
          type: 'CONFIG_SUBTASK_UPDATE',
          id: index,
          key: 'cases-edit',
          casesId: subindex,
          casesKey: 'input',
          value: `${filename}.in`,
        });
      }
    }
  };
  const refs = {
    input: useRef(),
    output: useRef(),
  };
  for (const type of ['input', 'output']) {
    useEffect(() => { // eslint-disable-line
      refs[type].current?.setSelectedItems(testcase[type] ? [testcase[type]] : []);
    }, [testcase[type]]);
  }
  if (!testcase || Object.keys(testcase).length === 0) {
    return (
      <tr><td colSpan={5}>{i18n('Failed to parse testcase.')}</td></tr>
    );
  }
  return (
    <tr>
      <td>
        <NumericInput
          rightElement={<Tag minimal>ms</Tag>}
          value={testcase.time ? parseTimeMS(testcase.time, false).toString() : ''}
          placeholder={parseTimeMS(defaultTime || '1000ms', false).toString()}
          onValueChange={dispatcher('time', 'ms')}
          buttonPosition="none"
          fill
        />
      </td>
      <td>
        <NumericInput
          rightElement={<Tag minimal>MB</Tag>}
          value={testcase.memory ? parseMemoryMB(testcase.memory, false).toString() : ''}
          placeholder={parseMemoryMB(defaultMemory || '256m', false).toString()}
          onValueChange={dispatcher('memory', 'MB')}
          buttonPosition="none"
          fill
        />
      </td>
      {['input', 'output'].map((t) => (
        <td key={t}>
          <FileSelectAutoComplete
            ref={refs[t]}
            width="100%"
            data={Files}
            selectedKeys={[testcase[t]]}
            onChange={dispatcher(t)}
          />
        </td>
      ))}
      <td className="col--operation">
        <a
          onClick={() => dispatch({
            type: 'CONFIG_SUBTASK_UPDATE', id: index, key: 'cases-delete', value: subindex,
          })}
        ><span className="icon icon-close"></span>
        </a>
      </td>
    </tr>
  );
}

export function CasesTable({ index }) {
  const len = useSelector((state: RootState) => state.config.subtasks[index].cases?.length);
  const dispatch = useDispatch();
  return (
    <table className="data-table">
      <thead style={{ display: 'none' }}>
        <tr>
          <th>{i18n('Time')}</th>
          <th>{i18n('Memory')}</th>
          <th>{i18n('Input')}</th>
          <th>{i18n('Output')}</th>
          <th className="col--operation">
            <a
              onClick={() => dispatch({
                type: 'CONFIG_SUBTASK_UPDATE',
                id: index,
                key: 'cases-add',
                value: { input: '', output: '' },
              })}
            ><span className="icon icon-add" />
            </a>
          </th>
        </tr>
      </thead>
      <tbody>
        <tr className="thead">
          <td>{i18n('Time')}</td>
          <td>{i18n('Memory')}</td>
          <td>{i18n('Input')}</td>
          <td>{i18n('Output')}</td>
          <td className="col--operation">
            <a
              onClick={() => dispatch({
                type: 'CONFIG_SUBTASK_UPDATE',
                id: index,
                key: 'cases-add',
                value: { input: '', output: '' },
              })}
            ><span className="icon icon-add" />
            </a>
          </td>
        </tr>
        {len > 0 && [...Array(len).keys()].map((i) => <TestCaseEntry index={index} subindex={i} key={i} />)}
      </tbody>
    </table>
  );
}
