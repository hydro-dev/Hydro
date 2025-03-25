import React from 'react';
import { ToastContainer } from 'react-toastify';

interface C {
  i18n: (key: string, ...args: any[]) => string;
  theme: 'light' | 'dark';
  codeFontFamily: string;
}

// eslint-disable-next-line
export const ComponentsContext = React.createContext<C>({
  i18n: (key) => key,
  theme: 'light',
  codeFontFamily: 'monospace',
});

export default function ComponentsProvider(props: { children: React.ReactNode } & C) {
  return <ComponentsContext.Provider value={props}>
    <ToastContainer
      position="bottom-left"
      autoClose={5000}
      hideProgressBar={false}
      newestOnTop={false}
      closeOnClick={false}
      rtl={false}
      pauseOnFocusLoss
      draggable
      pauseOnHover
      theme={props.theme}
    />
    {props.children}
  </ComponentsContext.Provider>;
}
