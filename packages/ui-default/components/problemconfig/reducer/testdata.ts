export default function reducer(state = [], action: any = {}) {
  switch (action.type) {
    case 'CONFIG_LOAD_FULFILLED': {
      return state.concat(action.payload.testdata);
    }
    case 'CONFIG_DELETE_TESTDATA': {
      const next = state.filter((i) => i.name !== action.value[0]);
      return next;
    }
    case 'CONFIG_ADD_TESTDATA': {
      return state.concat([action.value]);
    }
    default:
      return state;
  }
}
