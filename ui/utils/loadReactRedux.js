export default async function loadReactRedux(storeReducer) {
  const React = await import('react');
  const { render, unmountComponentAtNode } = await import('react-dom');
  const { Provider } = await import('react-redux');
  const { createStore, applyMiddleware } = await import('redux');
  const { default: reduxThunk } = await import('redux-thunk');
  const { default: reduxPromise } = await import('redux-promise-middleware');

  const reduxMiddlewares = [];
  reduxMiddlewares.push(reduxThunk);
  reduxMiddlewares.push(reduxPromise());

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
    render,
    unmountComponentAtNode,
    Provider,
    store,
  };
}
