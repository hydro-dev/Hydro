import _ from 'lodash';
import Notification from 'vj/components/notification';

export default function reducer(state = {}, action: any = {}) {
  switch (action.type) {
    case 'DIALOGUES_LOAD_DIALOGUES_FULFILLED': {
      const dialogues = action.payload.messages;
      return { ...state, ..._.fromPairs(_.map(dialogues, (d) => [d._id, false])) };
    }
    case 'DIALOGUES_CREATE': {
      const { user } = action.payload;
      return {
        ...state,
        [user._id]: false,
      };
    }
    case 'DIALOGUES_POST_SEND_PENDING': {
      const id = action.meta.dialogueId;
      return {
        ...state,
        [id]: true,
      };
    }
    case 'DIALOGUES_POST_SEND_REJECTED': {
      Notification.error(action.payload.message);
      const id = action.meta.dialogueId;
      return {
        ...state,
        [id]: false,
      };
    }
    case 'DIALOGUES_POST_SEND_FULFILLED': {
      const id = action.meta.dialogueId;
      return {
        ...state,
        [id]: false,
      };
    }
    case 'DIALOGUES_MESSAGE_PUSH': {
      const { udoc } = action.payload;
      return {
        ...state,
        [udoc._id]: false,
      };
    }
    default:
      return state;
  }
}
