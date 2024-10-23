let cacheKey = `${UserContext._id}/${UiContext.pdoc.domainId}/${UiContext.pdoc.docId}`;
if (UiContext.tdoc?._id) cacheKey += `@${UiContext.tdoc._id}`;

// TODO switch to indexeddb
export default function reducer(state = {
  lang: localStorage.getItem(`${cacheKey}#lang`) || UiContext.codeLang,
  code: localStorage.getItem(cacheKey) || UiContext.codeTemplate,
}, action: any = {}) {
  if (action.type === 'SCRATCHPAD_EDITOR_UPDATE_CODE') {
    localStorage.setItem(cacheKey, action.payload);
    return {
      ...state,
      code: action.payload,
    };
  }
  if (action.type === 'SCRATCHPAD_EDITOR_SET_LANG') {
    localStorage.setItem(`${cacheKey}#lang`, action.payload);
    return {
      ...state,
      lang: action.payload,
    };
  }
  return state;
}
