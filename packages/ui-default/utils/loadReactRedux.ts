import { Action, AnyAction, Reducer } from 'redux';

export default async function loadReactRedux<S, A extends Action = AnyAction>(storeReducer: Reducer<S, A>) {
  const React = await import('react');
  const { createRoot } = await import('react-dom/client');
  const { Provider } = await import('react-redux');
  const { createStore, applyMiddleware } = await import('redux');
  const { default: reduxThunk } = await import('redux-thunk');
  const { default: reduxPromise } = await import('redux-promise-middleware');

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

window.Hydro.utils.loadReactRedux = loadReactRedux;
