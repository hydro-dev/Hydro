let cacheKey = `${UserContext._id}/${UiContext.pdoc.domainId}/${UiContext.pdoc.docId}`;
if (UiContext.tdoc?._id && UiContext.tdoc.rule !== 'homework') cacheKey += `@${UiContext.tdoc._id}`;

export default function reducer(state = {
  lang: UiContext.codeLang,
  code: localStorage.getItem(cacheKey) || UiContext.codeTemplate,
}, action) {
  switch (action.type) {
  case 'SCRATCHPAD_EDITOR_UPDATE_CODE': {
    localStorage.setItem(cacheKey, action.payload);
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
