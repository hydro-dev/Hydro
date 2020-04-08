import _ from 'lodash';

export default function reducer(state = {}, action) {
  switch (action.type) {
  case 'DIALOGUES_LOAD_DIALOGUES_FULFILLED': {
    const dialogues = action.payload.messages;
    return _.fromPairs(_.map(dialogues, d => [d._id, '']));
  }
  case 'DIALOGUES_CREATE': {
    const { id } = action.payload;
    return {
      ...state,
      [id]: '',
    };
  }
  case 'DIALOGUES_INPUT_CHANGED': {
    const id = action.meta.dialogueId;
    return {
      ...state,
      [id]: action.payload,
    };
  }
  case 'DIALOGUES_POST_REPLY_FULFILLED': {
    const id = action.meta.dialogueId;
    return {
      ...state,
      [id]: '',
    };
  }
  case 'DIALOGUES_POST_SEND_FULFILLED': {
    const { placeholderId } = action.meta;
    return {
      ..._.omit(state, placeholderId),
      [action.payload.mdoc._id]: '',
    };
  }
  case 'DIALOGUES_MESSAGE_PUSH': {
    const { type, data } = action.payload;
    const id = data._id;
    if (type === 'new') {
      return {
        ...state,
        [id]: '',
      };
    }
    return state;
  }
  default:
    return state;
  }
}
