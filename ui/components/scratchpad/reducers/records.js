import _ from 'lodash';

export default function reducer(state = {
  rows: [],
  items: {},
}, action) {
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
    if (rdoc.uid !== UserContext.uid
      || rdoc.domain_id !== UserContext.domain
      || rdoc.pid !== Context.problemId
    ) {
      return state;
    }
    return {
      ...state,
      rows: [rdoc._id, ...state.rows],
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
