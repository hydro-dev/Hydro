import { combineReducers } from 'redux';
import ui from './ui';
import editor from './editor';
import pretest from './pretest';
import records from './records';

const reducer = combineReducers({
  ui,
  editor,
  pretest,
  records,
});

export default reducer;
