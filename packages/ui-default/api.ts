export { default as delay, default as sleep } from './utils/delay';
export { default as emulateAnchorClick } from './utils/emulateAnchorClick';
export { default as i18n } from './utils/i18n';
export { default as loadReactRedux } from './utils/loadReactRedux';
export * from './utils/mediaQuery';
export * as mongoId from './utils/mongoId';
export { default as pipeStream } from './utils/pipeStream';
export { default as pjax } from './utils/pjax';
export { default as request } from './utils/request';
export * from './utils/slide';
export { default as substitute } from './utils/substitute';
export { default as tpl } from './utils/tpl';
export { default as zIndexManager } from './utils/zIndexManager';
export * from './utils/zip';
export { default as AutoComplete } from './components/autocomplete';
export { default as Notification } from './components/notification';
export * from './components/dialog';
export { default as loadMonaco } from './components/monaco/loader';
export * as redux from 'react-redux';
export { default as $ } from 'jquery';
export { default as _ } from 'lodash';
export { default as React } from 'react';
export { default as ReactDOM } from 'react-dom/client';
export * from './misc/Page';

export default async function load(name: string) {
  if (module.exports[name]) return module.exports[name];
  if (name === 'echarts') return import('echarts');
  if (name === 'moment') return import('moment');
  throw new Error(`Module ${name} not found`);
}
export { load, UserContext, UiContext };
export function addPage(page: import('./misc/Page').Page | (() => Promise<void> | void)) {
  window.Hydro.extraPages.push(page);
}

declare global {
  interface Window {
    LANGS: Record<string, any>;
  }

  let UserContext: Record<string, any>;
  let UiContext: Record<string, any>;
}

(window as any).HydroExports = module.exports;

// Below are old version api compat
import $ from 'jquery';
import _ from 'lodash';
import React from 'react';
import ReactDOM from 'react-dom/client';
import * as redux from 'react-redux';

const modules = {
  _, $, React, redux, ReactDOM, load,
};

declare global {
  interface Window {
    node_modules: typeof modules;
  }
}

Object.assign(window, { node_modules: modules, $, jQuery: $ });
