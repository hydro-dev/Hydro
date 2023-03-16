import { parseMemoryMB, parseTimeMS, sortFiles } from '@hydrooj/utils/lib/common';
import Ajv from 'ajv';
import type { ProblemConfigFile, TestCaseConfig } from 'hydrooj/src/interface';
import yaml from 'js-yaml';
import { cloneDeep } from 'lodash';
import schema from '../../monaco/schema/problemconfig';

type State = ProblemConfigFile & {
  __loaded: boolean;
  __valid: boolean;
  __errors: string[];
  __cases: TestCaseConfig[];
};
const ajv = new Ajv();
const validate = ajv.compile(schema);

export default function reducer(state = {
  type: 'default', __loaded: false, __valid: true, __errors: [], __cases: [],
} as State, action: any = {}): State {
  switch (action.type) {
    case 'CONFIG_LOAD_FULFILLED': {
      try {
        const data = yaml.load(action.payload.config) as any;
        if (!validate(data)) {
          return { ...state, __valid: false, __errors: validate.errors.map((i) => `${i.instancePath}: ${i.message}`) };
        }
        const subtasks = (data as any).subtasks;
        for (const subtask of subtasks || []) {
          if (typeof subtask.id !== 'number') {
            for (let i = 1; ; i++) {
              if (!subtasks.find((s) => s.id === i)) {
                subtask.id = i;
                break;
              }
            }
          }
        }
        return {
          ...state, ...data as any, __valid: true, __errors: [], __loaded: true,
        };
      } catch (e) {
        return { ...state, __valid: false, __errors: [e.message] };
      }
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
        const data = yaml.load(action.payload);
        if (!validate(data)) {
          return {
            ...state,
            __valid: false,
            __errors: validate.errors.map((i) => `${i.instancePath}: ${i.message}`),
            __loaded: true,
          };
        }
        return {
          ...state, ...data as object, __valid: true, __errors: [], __loaded: true,
        };
      } catch (e) {
        return {
          ...state, __valid: false, __errors: [e.message], __loaded: true,
        };
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
        if (typeof subtask.id !== 'number') {
          for (let i = 1; ; i++) {
            if (!subtasks.find((s) => s.id === s)) {
              subtask.id = i;
              break;
            }
          }
        }
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
      const subtask = state.subtasks.find((i) => i.id === action.id);
      if (action.value !== '' && ['score', 'id'].includes(action.key)) action.value = +action.value;
      if (action.key === 'if' && action.value.join('') !== '') action.value = action.value.map((i) => +i);
      if (action.key.split('-')[0] === 'cases') {
        if (action.key === 'cases-add') subtask.cases.push(action.value);
        else if (action.key === 'cases-edit') {
          if (action.value === '' && !['input', 'output'].includes(action.casesKey)) delete subtask.cases[action.casesId][action.casesKey];
          else subtask.cases[action.casesId][action.casesKey] = action.value;
        } else if (action.key === 'cases-delete') {
          subtask.cases = subtask.cases.filter((k, v) => v !== action.value);
        }
      } else if (action.key === 'add') {
        subtasks.push({
          cases: [],
          score: 0,
          id: Object.keys(subtasks).map((i) => subtasks[i].id).reduce((a, b) => Math.max(+a, +b), 0) + 1,
        });
        return { ...state, subtasks };
      } else if (action.key === 'delete') return { ...state, subtasks: subtasks.filter((k, v) => v !== action.id) };
      else {
        if (action.value === '' || (action.key === 'if' && action.value.join('') === '')) delete subtask[action.key];
        else subtask[action.key] = action.value;
      }
      return { ...state, subtasks };
    }
    case 'problemconfig/updateGlobalConfig': {
      const n = { ...state, time: action.time, memory: action.memory };
      if (!n.time) delete n.time;
      if (!n.memory) delete n.memory;
      return n;
    }
    case 'problemconfig/updateSubtaskConfig': {
      if (!state.subtasks.find((i) => i.id === action.id)) return state;
      const subtask = { ...state.subtasks.find((i) => i.id === action.id) };
      const subtasks = [...state.subtasks];
      subtasks.splice(state.subtasks.findIndex((i) => i.id === action.id), 1, subtask);
      if (action.payload.time) subtask.time = action.payload.time;
      if (action.payload.memory) subtask.memory = action.payload.memory;
      if (action.payload.score) subtask.score = +action.payload.score || 0;
      if (action.payload.if) subtask.if = action.payload.if;
      if (action.payload.type) subtask.type = action.payload.type;
      if (!subtask.time) delete subtask.time;
      if (!subtask.memory) delete subtask.memory;
      return { ...state, subtasks };
    }
    case 'problemconfig/addTestcases': {
      return { ...state, __cases: sortFiles([...state.__cases, ...action.cases], 'input') };
    }
    case 'problemconfig/moveTestcases': {
      const testcases = action.payload.cases;
      const subtasks = cloneDeep(state.subtasks);
      const __cases = action.payload.source === -1
        ? state.__cases.filter((i) => !testcases.find((j) => i.input === j.input && i.output === j.output))
        : action.payload.target === -1
          ? sortFiles([...state.__cases, ...testcases], 'input')
          : state.__cases;
      for (const key in subtasks) {
        const subtask = subtasks[key];
        if (subtask.id === action.payload.source) {
          subtask.cases = subtask.cases.filter((i) => !testcases.find((j) => i.input === j.input && i.output === j.output));
        } else if (subtask.id === action.payload.target) {
          subtask.cases = sortFiles([...subtask.cases, ...testcases], 'input');
        }
      }
      return { ...state, subtasks, __cases };
    }
    case 'problemconfig/deleteSubtask': {
      const subtasks = state.subtasks.filter((i) => i.id !== action.id);
      return { ...state, subtasks };
    }
    default:
      return state;
  }
}
