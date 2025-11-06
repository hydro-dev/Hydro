import { parseMemoryMB, parseTimeMS, sortFiles } from '@hydrooj/utils/lib/common';
import type { ProblemConfigFile, TestCaseConfig } from 'hydrooj/src/interface';
import Ajv from 'ajv';
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
  type: 'default', __loaded: false, __valid: false, __errors: [], __cases: [], subtasks: [],
} as State, action: any = {}): State {
  switch (action.type) {
    case 'CONFIG_LOAD_FULFILLED': {
      const c = { ...state, __loaded: true };
      try {
        let data = yaml.load(action.payload.config) as any;
        if (typeof data !== 'object') data = { subtasks: [] };
        else data.subtasks ||= [];
        if (!validate(data)) {
          Object.assign(c, data);
          c.__errors = validate.errors.map((i) => `${i.instancePath}: ${i.message}`);
          return c;
        }
        const subtasks = (data as any).subtasks;
        for (const subtask of subtasks) {
          if (typeof subtask.id !== 'number') {
            for (let i = 1; ; i++) {
              if (!subtasks.find((s) => s.id === i)) {
                subtask.id = i;
                break;
              }
            }
          }
        }
        Object.assign(c, data);
        c.__valid = true;
      } catch (e) {
        c.__errors.push(e.message);
      }
      return c;
    }
    case 'CONFIG_FORM_UPDATE': {
      const next = { ...state, [action.key]: action.value };
      if (action.key === 'score' && action.value) next.score = +next.score;
      if (action.key === 'checker_type' && action.value === 'other') next.checker_type = 'syzoj';
      if (!action.value || (action.value instanceof Array && !action.value.join(''))) delete next[action.key];
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
    case 'problemconfig/updateFileIO': {
      const n = { ...state, filename: action.filename };
      if (!n.filename) delete n.filename;
      return n;
    }
    case 'problemconfig/updateGlobalConfig': {
      const n = { ...state, time: action.time, memory: action.memory };
      if (!n.time) delete n.time;
      if (!n.memory) delete n.memory;
      return n;
    }
    case 'problemconfig/addSubtask': {
      const subtasks = cloneDeep(state.subtasks);
      subtasks.push({
        cases: [],
        score: 0,
        id: Object.keys(subtasks).map((i) => subtasks[i].id).reduce((a, b) => Math.max(+a, +b), 0) + 1,
      });
      return { ...state, subtasks };
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
      const targetCases = action.payload.target === -1
        ? state.__cases
        : (subtasks.find((s) => s.id === action.payload.target)?.cases || []);
      const toAdd = testcases.filter((tc) => !targetCases.find((j) => j.input === tc.input && j.output === tc.output));
      const __cases = action.payload.source === -1
        ? state.__cases.filter((i) => !testcases.find((j) => i.input === j.input && i.output === j.output))
        : action.payload.target === -1
          ? sortFiles([...state.__cases, ...toAdd], 'input')
          : state.__cases;
      for (const key in subtasks) {
        const subtask = subtasks[key];
        if (subtask.id === action.payload.source) {
          subtask.cases = subtask.cases.filter((i) => !testcases.find((j) => i.input === j.input && i.output === j.output));
        } else if (subtask.id === action.payload.target) {
          subtask.cases = sortFiles([...subtask.cases, ...toAdd], 'input');
        }
      }
      return { ...state, subtasks, __cases };
    }
    case 'problemconfig/delTestcases': {
      const testcases = action.cases;
      return { ...state, __cases: state.__cases.filter((i) => !testcases.find((j) => i.input === j.input && i.output === j.output)) };
    }
    case 'problemconfig/deleteSubtask': {
      const currentCases = state.subtasks.find((i) => i.id === action.id)?.cases || [];
      const subtasks = state.subtasks.filter((i) => i.id !== action.id);
      const add = currentCases.filter((i) => !subtasks.find((j) => j.cases.find((k) => k.input === i.input && k.output === i.output)));
      return { ...state, subtasks, __cases: sortFiles([...state.__cases, ...add], 'input') };
    }
    default:
      return state;
  }
}
