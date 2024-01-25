import _ from 'lodash';

export default function reducer(state = {}, action = {}) {
  switch (action.type) {
    case 'DIALOGUES_LOAD_DIALOGUES_FULFILLED': {
      const dialogues = action.payload.messages;
      return { ...state, ..._.fromPairs(_.map(dialogues, (d) => [d._id, ''])) };
    }
    case 'DIALOGUES_CREATE': {
      const { user } = action.payload;
      return {
        ...state,
        [user._id]: '',
      };
    }
    case 'DIALOGUES_INPUT_CHANGED': {
      const id = action.meta.dialogueId;
      return {
        ...state,
        [id]: action.payload,
      };
    }
    case 'DIALOGUES_POST_SEND_FULFILLED': {
      const id = action.meta.dialogueId;
      return {
        ...state,
        [id]: '',
      };
    }
    case 'DIALOGUES_MESSAGE_PUSH': {
      const { udoc } = action.payload;
      if (!state[udoc._id]) {
        return {
          ...state,
          [udoc._id]: '',
        };
      }
      return state;
    }
    default:
      return state;
  }
}
