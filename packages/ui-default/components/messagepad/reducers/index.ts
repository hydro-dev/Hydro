import { combineReducers } from 'redux';
import activeId from './activeId';
import dialogues from './dialogues';
import inputs from './inputs';
import isPosting from './isPosting';

const reducer = combineReducers({
  activeId,
  dialogues,
  inputs,
  isPosting,
});

export default reducer;
