import React from 'react';
import { Slide, ToastContainer } from 'react-toastify';

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
      hideProgressBar
      newestOnTop={false}
      closeOnClick={false}
      rtl={false}
      pauseOnFocusLoss
      draggable
      pauseOnHover
      theme="colored"
      transition={Slide}
    />
    {props.children}
  </ComponentsContext.Provider>;
}
