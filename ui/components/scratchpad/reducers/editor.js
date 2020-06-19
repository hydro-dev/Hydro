export default function reducer(state = {
  lang: Context.codeLang,
  code: Context.codeTemplate,
}, action) {
  switch (action.type) {
  case 'SCRATCHPAD_EDITOR_UPDATE_CODE': {
    return {
      ...state,
      code: action.payload,
    };
  }
  case 'SCRATCHPAD_EDITOR_SET_LANG': {
    return {
      ...state,
      lang: action.payload,
    };
  }
  default:
    return state;
  }
}
