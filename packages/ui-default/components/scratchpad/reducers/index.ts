import { combineReducers } from 'redux';
import ui from './ui';
import editor from './editor';
import pretest from './pretest';
import records from './records';
import state from './state';

const reducer = combineReducers({
  ui,
  editor,
  pretest,
  records,
  state,
});

export default reducer;
export type RootState = ReturnType<typeof reducer>;
