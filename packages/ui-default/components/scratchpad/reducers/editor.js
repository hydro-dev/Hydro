export default function reducer(state = {
  lang: UiContext.codeLang,
  code: localStorage.getItem(`${UserContext._id}/${UiContext.pdoc.domainId}/${UiContext.pdoc.docId}`) || UiContext.codeTemplate,
}, action) {
  switch (action.type) {
  case 'SCRATCHPAD_EDITOR_UPDATE_CODE': {
    localStorage.setItem(`${UserContext._id}/${UiContext.pdoc.domainId}/${UiContext.pdoc.docId}`, action.payload);
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
