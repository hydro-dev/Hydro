import yaml from 'js-yaml';
import type { ProblemConfigFile } from 'hydrooj/src/interface';
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
      const autocases = action.value;
      if (autocases.subtasks.length === 0) next.subtasks = [];
      else {
        next.subtasks = autocases.subtasks.map((subtask) => (
          { ...subtask, ...{ cases: subtask.cases.map((i) => ({ input: i.input, output: i.output })) } }));
      }
      return next;
    }
    case 'CONFIG_SUBTASKS_SWITCH': {
      const next = { ...state };
      next.subtasks = next.cases.map((k, v) => ({
        id: v, time: k.time, memory: k.memory, cases: [{ input: k.input, output: k.output }],
      }));
      if (!next.subtasks.length) next.subtasks.push({ id: 0 });
      delete next.cases;
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
      } else if (action.key === 'add') subtasks.push({ time: '1000ms', memory: '256mb', cases: [] });
      else if (action.key === 'delete') delete subtasks[action.key];
      else {
        if (action.value === '' || (action.key === 'if' && action.value.join('') === '')) delete subsubtasks[action.key];
        else subsubtasks[action.key] = action.value;
      }
      if (action.key !== 'delete') subtasks[action.id] = subsubtasks;
      return { ...state, subtasks };
    }
    default:
      return state;
  }
}
