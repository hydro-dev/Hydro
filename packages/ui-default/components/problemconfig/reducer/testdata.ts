export default function reducer(state = [], action) {
  switch (action.type) {
  case 'CONFIG_LOAD_FULFILLED': {
    return state.concat(action.payload.testdata);
  }
  case 'CONFIG_DELETE_TESTDATA': {
    return state.filter((i) => i.name !== action.payload.name);
  }
  case 'CONFIG_ADD_TESTDATA': {
    state.push(action.payload);
    return state;
  }
  default:
    return state;
  }
}
