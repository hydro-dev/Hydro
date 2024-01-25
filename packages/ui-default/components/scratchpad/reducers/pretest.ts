import { STATUS_TEXTS } from '@hydrooj/utils/lib/status';

export default function reducer(state = {
  input: '',
  output: '',
  rid: null,
}, action: any = {}) {
  if (action.type === 'SCRATCHPAD_PRETEST_DATA_CHANGE') {
    const { type, value } = action.payload;
    return {
      ...state,
      [type]: value,
    };
  }
  if (action.type === 'SCRATCHPAD_RECORDS_PUSH') {
    const { rdoc } = action.payload;
    if (rdoc._id === state.rid) {
      const output = [`${STATUS_TEXTS[rdoc.status]} ${rdoc.time}ms ${rdoc.memory}KiB`];
      if (rdoc.compilerTexts.length) output.push(rdoc.compilerTexts.join('\n'));
      if (rdoc.testCases.length) output.push(rdoc.testCases[0].message || '');
      return {
        ...state,
        output: output.join('\n'),
      };
    }
  }
  if (action.type === 'SCRATCHPAD_POST_PRETEST_FULFILLED') {
    return {
      ...state,
      rid: action.payload.rid,
    };
  }
  return state;
}
