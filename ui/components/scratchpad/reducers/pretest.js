import { v4 as uuid } from 'uuid';

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
