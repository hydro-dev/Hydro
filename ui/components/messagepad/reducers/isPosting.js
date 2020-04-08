import _ from 'lodash';
import Notification from 'vj/components/notification';

export default function reducer(state = {}, action) {
  switch (action.type) {
  case 'DIALOGUES_LOAD_DIALOGUES_FULFILLED': {
    const dialogues = action.payload.messages;
    return _.fromPairs(_.map(dialogues, d => [d._id, false]));
  }
  case 'DIALOGUES_CREATE': {
    const { id } = action.payload;
    return {
      ...state,
      [id]: false,
    };
  }
  case 'DIALOGUES_POST_REPLY_PENDING': {
    const id = action.meta.dialogueId;
    return {
      ...state,
      [id]: true,
    };
  }
  case 'DIALOGUES_POST_REPLY_REJECTED': {
    Notification.error(action.payload.message);
    const id = action.meta.dialogueId;
    return {
      ...state,
      [id]: false,
    };
  }
  case 'DIALOGUES_POST_REPLY_FULFILLED': {
    const id = action.meta.dialogueId;
    return {
      ...state,
      [id]: false,
    };
  }
  case 'DIALOGUES_POST_SEND_PENDING': {
    const { placeholderId } = action.meta;
    return {
      ...state,
      [placeholderId]: true,
    };
  }
  case 'DIALOGUES_POST_SEND_REJECTED': {
    Notification.error(action.payload.message);
    const { placeholderId } = action.meta;
    return {
      ...state,
      [placeholderId]: false,
    };
  }
  case 'DIALOGUES_POST_SEND_FULFILLED': {
    const { placeholderId } = action.meta;
    return {
      ..._.omit(state, placeholderId),
      [action.payload.mdoc._id]: false,
    };
  }
  case 'DIALOGUES_MESSAGE_PUSH': {
    const { type, data } = action.payload;
    const id = data._id;
    if (type === 'new') {
      return {
        ...state,
        [id]: false,
      };
    }
    return state;
  }
  default:
    return state;
  }
}
