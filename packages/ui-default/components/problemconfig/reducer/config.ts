import { parseMemoryMB, parseTimeMS } from '@hydrooj/utils/lib/common';
import type { ProblemConfigFile } from 'hydrooj/src/interface';
import yaml from 'js-yaml';
import { cloneDeep } from 'lodash';

type State = ProblemConfigFile & { __loaded: boolean };

export default function reducer(state = { type: 'default', __loaded: false } as State, action): State {
  switch (action.type) {
    case 'CONFIG_LOAD_FULFILLED': {
      return { ...state, ...yaml.load(action.payload.config) as object, __loaded: true };
    }
    case 'CONFIG_FORM_UPDATE': {
      const next = { ...state, [action.key]: action.value };
      if (action.key === 'score' && action.value) next.score = +next.score;
      if (action.key === 'checker_type' && action.value === 'other') next.checker_type = 'syzoj';
      if (!action.value || (typeof action.value === 'object' && !action.value.join(''))) delete next[action.key];
      return next;
    }
    case 'CONFIG_CODE_UPDATE': {
      try {
        return { ...state, ...yaml.load(action.payload) as object };
      } catch {
        return state;
      }
    }
    case 'CONFIG_AUTOCASES_UPDATE': {
      const next = { ...state };
      const { subtasks } = action;
      for (const subtask of subtasks) {
        if (subtask.time === parseTimeMS(state.time || '1s')) delete subtask.time;
        if (subtask.memory === parseMemoryMB(state.memory || '256m')) delete subtask.memory;
        if (subtask.time) subtask.time += 'ms';
        if (subtask.memory) subtask.memory += 'MB';
      }
      if (subtasks.length === 0) next.subtasks = [];
      else {
        next.subtasks = subtasks.map((subtask) => (
          { ...subtask, ...{ cases: subtask.cases.map((i) => ({ input: i.input, output: i.output })) } }));
      }
      return next;
    }
    case 'CONFIG_SUBTASK_UPDATE': {
      const subtasks = cloneDeep(state.subtasks);
      const subsubtasks = cloneDeep(state.subtasks[action.id]);
      if (action.value !== '' && ['score', 'id'].includes(action.key)) action.value = +action.value;
      if (action.key === 'if' && action.value.join('') !== '') action.value = action.value.map((i) => +i);
      if (action.key.split('-')[0] === 'cases') {
        if (action.key === 'cases-add') subsubtasks.cases.push(action.value);
        else if (action.key === 'cases-edit') {
          if (action.value === '') delete subsubtasks.cases[action.casesId][action.casesKey];
          else subsubtasks.cases[action.casesId][action.casesKey] = action.value;
        } else if (action.key === 'cases-delete') {
          subsubtasks.cases = subsubtasks.cases.filter((k, v) => v !== action.value);
        }
      } else if (action.key === 'add') {
        return { ...state, subtasks: [...subtasks, { time: state.time || '1s', memory: state.memory || '256m', cases: [] }] };
      } else if (action.key === 'delete') return { ...state, subtasks: subtasks.filter((k, v) => v !== action.id) };
      else {
        if (action.value === '' || (action.key === 'if' && action.value.join('') === '')) delete subsubtasks[action.key];
        else subsubtasks[action.key] = action.value;
      }
      subtasks[action.id] = subsubtasks;
      return { ...state, subtasks };
    }
    default:
      return state;
  }
}
