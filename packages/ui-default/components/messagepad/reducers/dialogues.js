import _ from 'lodash';

export default function reducer(state = {}, action = {}) {
  switch (action.type) {
    case 'DIALOGUES_LOAD_DIALOGUES_FULFILLED': {
      const { messages } = action.payload;
      return { ...state, ..._.keyBy(messages, 'udoc._id') };
    }
    case 'DIALOGUES_CREATE': {
      const { user } = action.payload;
      if (state[user._id]) return state;
      return {
        ...state,
        [user._id]: {
          _id: user._id,
          udoc: { ...user },
          messages: [],
        },
      };
    }
    case 'DIALOGUES_POST_SEND_FULFILLED': {
      const id = action.meta.dialogueId;
      const { mdoc } = action.payload;
      return {
        ...state,
        [id]: {
          ...state[id],
          messages: [
            ...state[id].messages,
            mdoc,
          ],
        },
      };
    }
    case 'DIALOGUES_MESSAGE_PUSH': {
      const { mdoc, udoc } = action.payload;
      const to = mdoc.from === UserContext._id ? mdoc.to : mdoc.from;
      return {
        ...state,
        [to]: {
          ...state[to] || {},
          udoc,
          messages: [
            ...state[to]?.messages || [],
            mdoc,
          ],
        },
      };
    }
    default:
      return state;
  }
}
