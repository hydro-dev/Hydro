export default function reducer(state = {
  input: '',
  output: '',
  rid: null,
}, action) {
  if (action.type === 'SCRATCHPAD_PRETEST_DATA_CHANGE') {
    const { type, value } = action.payload;
    return {
      ...state,
      [type]: value,
    };
  }
  if (action.type === 'SCRATCHPAD_RECORDS_PUSH') {
    const { rdoc } = action.payload;
    if (rdoc._id === state.rid && rdoc.testCases[0]) {
      return {
        ...state,
        output: rdoc.testCases[0].message,
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
