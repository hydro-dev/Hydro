import React from 'react';
import { createRoot } from 'react-dom/client';
import type { Action, Reducer, UnknownAction } from 'redux';

export default async function loadReactRedux<S, A extends Action = UnknownAction>(storeReducer: Reducer<S, A>) {
  const [{ Provider }, { createStore, applyMiddleware }, { thunk: reduxThunk }, { default: reduxPromise }] = await Promise.all([
    import('react-redux'),
    import('redux'),
    import('redux-thunk'),
    import('redux-promise-middleware'),
  ]);
  const reduxMiddlewares = [];
  reduxMiddlewares.push(reduxThunk);
  reduxMiddlewares.push(reduxPromise);

  if (process.env.NODE_ENV !== 'production') {
    const { createLogger } = await import('redux-logger');
    reduxMiddlewares.push(createLogger({
      collapsed: true,
      duration: true,
    }));
  }

  const store = createStore(storeReducer, applyMiddleware(...reduxMiddlewares));

  return {
    React,
    createRoot,
    Provider,
    store,
  };
}
