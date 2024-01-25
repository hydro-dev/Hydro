import _ from 'lodash';

export default function reducer(state = {
  rows: [],
  items: {},
}, action: any = {}) {
  switch (action.type) {
    case 'SCRATCHPAD_RECORDS_LOAD_SUBMISSIONS_FULFILLED': {
      const { rdocs } = action.payload;
      return {
        ...state,
        rows: _.map(rdocs, '_id'),
        items: _.keyBy(rdocs, '_id'),
      };
    }
    case 'SCRATCHPAD_RECORDS_PUSH': {
      const { rdoc } = action.payload;
      const rows = [...state.rows];
      if (!rows.includes(rdoc._id)) {
        return {
          ...state,
          rows: [rdoc._id, ...state.rows],
          items: {
            ...state.items,
            [rdoc._id]: rdoc,
          },
        };
      }
      return {
        ...state,
        items: {
          ...state.items,
          [rdoc._id]: rdoc,
        },
      };
    }
    default:
      return state;
  }
}
