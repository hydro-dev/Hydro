import { combineReducers } from 'redux';
import config from './config';
import testdata from './testdata';

const reducer = combineReducers({
  config,
  testdata,
});

export default reducer;
export type RootState = ReturnType<typeof reducer>;
