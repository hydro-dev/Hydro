import uuid from 'uuid/v4';
import _ from 'lodash';

const initialId = uuid();

export default function reducer(state = {
  counter: 1,
  current: initialId,
  tabs: [initialId],
  meta: {
    [initialId]: {
      id: initialId,
      title: '#1',
    },
  },
  data: {
    [initialId]: {
      id: initialId,
      title: '#1',
      input: '',
      output: '',
    },
  },
}, action) {
  switch (action.type) {
  case 'SCRATCHPAD_PRETEST_SWITCH_TO_DATA': {
    const currentId = action.payload;
    return {
      ...state,
      current: currentId,
    };
  }
  case 'SCRATCHPAD_PRETEST_ADD_DATA': {
    const newCounter = state.counter + 1;
    const newId = uuid();
    return {
      ...state,
      counter: newCounter,
      current: newId,
      tabs: [...state.tabs, newId],
      meta: {
        ...state.meta,
        [newId]: {
          id: newId,
          title: `#${newCounter}`,
        },
      },
      data: {
        ...state.data,
        [newId]: {
          id: newId,
          input: '',
          output: '',
        },
      },
    };
  }
  case 'SCRATCHPAD_PRETEST_REMOVE_DATA': {
    const orgIdx = state.tabs.indexOf(state.current);
    let newCounter = state.counter;
    const newTabs = _.without(state.tabs, state.current);
    const newMeta = _.omit(state.meta, state.current);
    const newData = _.omit(state.data, state.current);
    if (newTabs.length === 0) {
      // keep at least one data
      const id = uuid();
      newTabs.push(id);
      newMeta[id] = {
        id,
        title: `#${++newCounter}`,
      };
      newData[id] = {
        input: '',
        output: '',
      };
    }
    const newIdx = (orgIdx < newTabs.length) ? orgIdx : orgIdx - 1;
    return {
      ...state,
      counter: newCounter,
      current: newTabs[newIdx],
      tabs: newTabs,
      meta: newMeta,
      data: newData,
    };
  }
  case 'SCRATCHPAD_PRETEST_DATA_CHANGE': {
    const { id, type, value } = action.payload;
    return {
      ...state,
      data: {
        ...state.data,
        [id]: {
          ...state.data[id],
          [type]: value,
        },
      },
    };
  }
  default:
    return state;
  }
}
