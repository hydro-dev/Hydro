import yaml from 'js-yaml';
import type { ProblemConfigFile } from 'hydrooj/src/interface';
import { cloneDeep } from 'lodash';

export default function reducer(state = { type: 'default' } as ProblemConfigFile, action): ProblemConfigFile {
  switch (action.type) {
    case 'CONFIG_LOAD_FULFILLED': {
      // TODO set yaml schema
      return { ...state, ...yaml.load(action.payload.config) as object };
    }
    case 'CONFIG_FORM_UPDATE': {
      const next = { ...state, [action.key]: action.value };
      if (!action.value || (typeof action.value === 'object' && !action.value.join(''))) delete next[action.key];
      if (action.key === 'type' && action.value !== 'default') {
        delete next.checker_type;
        delete next.checker;
      }
      if (action.key === 'type' && action.value !== 'interactive') delete next.interactor;
      if (action.key === 'checker_type' && ['default', 'strict'].includes(action.value)) delete next.checker;
      return next;
    }
    case 'CONFIG_CODE_UPDATE': {
      try {
        return yaml.load(action.payload);
      } catch {
        return state;
      }
    }
    case 'CONFIG_AUTOCASES_UPDATE': {
      const next = { ...state };
      const autocases = action.value;
      if (autocases.subtasks.length === 0) next.cases = [];
      else if (autocases.subtasks.length === 1) {
        next.score = autocases.subtasks[0].score;
        next.cases = [];
        autocases.subtasks[0].cases.map((i) => next.cases.push({
          time: autocases.subtasks[0].time, memory: autocases.subtasks[0].memory, input: i.input, output: i.output,
        }));
      } else {
        next.subtasks = autocases.subtasks.map((subtask) => (
          { ...subtask, ...{ cases: subtask.cases.map((i) => ({ input: i.input, output: i.output })) } }));
      }
      return next;
    }
    case 'CONFIG_SUBTASKS_SWITCH': {
      const next = { ...state };
      next.subtasks = next.cases;
      if (!next.subtasks.length) next.subtasks.push({ id: 0 });
      delete next.cases;
      return next;
    }
    case 'CONFIG_CASES_UPDATE': {
      if (action.key === 'cases-add') return { ...state, cases: [...state.cases, action.value] };
      if (action.key === 'cases-edit') {
        const cases = cloneDeep(state.cases);
        cases[action.casesId][action.casesKey] = action.value;
        return { ...state, cases };
      } if (action.key === 'cases-delete') {
        return { ...state, cases: state.cases.filter((k, v) => v !== action.value) };
      }
      return state;
    }
    case 'CONFIG_SUBTASK_UPDATE': {
      if (action.key.split('-')[0] === 'cases') {
        const subtasks = cloneDeep(state.subtasks);
        const subsubtasks = cloneDeep(state.subtasks[action.id]);
        if (action.key === 'cases-add') subsubtasks.cases.push(action.value);
        else if (action.key === 'cases-edit') subsubtasks.cases[action.casesId][action.casesKey] = action.value;
        else if (action.key === 'cases-delete') {
          subsubtasks.cases = subsubtasks[action.id].cases.filter((k, v) => v !== action.value);
        }
        subtasks[action.id] = subsubtasks;
        return { ...state, subtasks };
      } else {
        const next = { ...state };
        if (action.key === 'add') next.subtasks.splice(action.id, 0, { id: 0 });
        else if (action.key === 'delete') delete next.subtasks[action.key];
        else next.subtasks[action.id][action.key] = action.value;
        return next;
      }
    }
    default:
      return state;
  }
}
