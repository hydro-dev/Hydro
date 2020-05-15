import _ from 'lodash';

export default function reducer(state = {}, action) {
  switch (action.type) {
  case 'DIALOGUES_LOAD_DIALOGUES_FULFILLED': {
    const { messages, udict } = action.payload;
    return _.keyBy(
      _.filter(
        _.map(messages, (m) => ({
          to_udoc: udict[m.to],
          from_udoc: udict[m.from],
          ...m,
        })),
        (m) => m.to_udoc && m.from_udoc,
      ),
      '_id',
    );
  }
  case 'DIALOGUES_CREATE': {
    const { id, user } = action.payload;
    return {
      ...state,
      [id]: {
        _id: id,
        from: UserContext._id,
        to: user._id,
        to_udoc: { ...user },
        reply: [],
        isPlaceholder: true,
      },
    };
  }
  case 'DIALOGUES_POST_REPLY_FULFILLED': {
    const id = action.meta.dialogueId;
    const { reply } = action.payload;
    return {
      ...state,
      [id]: {
        ...state[id],
        reply: [
          ...state[id].reply,
          reply,
        ],
      },
    };
  }
  case 'DIALOGUES_POST_SEND_FULFILLED': {
    const { placeholderId } = action.meta;
    return {
      ..._.omit(state, placeholderId),
      [action.payload.mdoc._id]: action.payload.mdoc,
    };
  }
  case 'DIALOGUES_MESSAGE_PUSH': {
    const { type, data } = action.payload;
    const id = data._id;
    if (type === 'new') {
      return {
        ...state,
        [id]: data,
      };
    } if (type === 'reply') {
      if (state[id] === undefined) {
        window.location.reload();
        return state;
      }
      return {
        ...state,
        [id]: {
          ...state[id],
          reply: [
            ...state[id].reply,
            data.reply[0],
          ],
        },
      };
    }
    return state;
  }
  default:
    return state;
  }
}
