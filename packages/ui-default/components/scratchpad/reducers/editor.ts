export default function reducer(state = {
  lang: UiContext.codeLang,
  code: UiContext.codeTemplate,
}, action: any = {}) {
  if (action.type === 'SCRATCHPAD_EDITOR_HYDRATE') return action.payload;
  if (action.type === 'SCRATCHPAD_EDITOR_UPDATE_CODE') return { ...state, code: action.payload };
  if (action.type === 'SCRATCHPAD_EDITOR_SET_LANG') return { ...state, lang: action.payload };
  return state;
}
