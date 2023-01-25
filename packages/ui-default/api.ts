export * from './utils';
export { default as Notification } from './components/notification';
export * from './components/dialog';
export * as bus from './bus';
export { default as AnsiUp } from 'ansi_up';
export { default as loadMonaco } from './components/monaco/loader';
export * as redux from 'react-redux';
export * from './components/zipDownloader';
export { default as $ } from 'jquery';
export { default as _ } from 'lodash';
export { default as React } from 'react';
export { default as ReactDOM } from 'react-dom/client';
export * from './misc/Page';

const lazyModules = {};
export default async function load(name: string) {
  if (window.node_modules[name]) return window.node_modules[name];
  if (name === 'echarts') return import('echarts');
  if (name === 'moment') return import('moment');
  if (!window.lazyloadMetadata?.[`${name}.lazy.js`]) throw new Error(`Module ${name} not found`);
  if (lazyModules[name]) return lazyModules[name];
  const tag = document.createElement('script');
  tag.src = `/lazy/${window.lazyloadMetadata[`${name}.lazy.js`]}/${name}.lazy.js`;
  lazyModules[name] = new Promise((resolve, reject) => {
    tag.onerror = reject;
    const timeout = setTimeout(reject, 30000);
    window.lazyModuleResolver[name] = (item) => {
      clearTimeout(timeout);
      resolve(item);
    };
  });
  document.body.appendChild(tag);
  return lazyModules[name];
}

import AutoComplete from './components/autocomplete';
import CustomSelectAutoComplete from './components/autocomplete/CustomSelectAutoComplete';
import DomainSelectAutoComplete from './components/autocomplete/DomainSelectAutoComplete';
import ProblemSelectAutoComplete from './components/autocomplete/ProblemSelectAutoComplete';
import UserSelectAutoComplete from './components/autocomplete/UserSelectAutoComplete';

export {
  load, AutoComplete, UserSelectAutoComplete, ProblemSelectAutoComplete, DomainSelectAutoComplete, CustomSelectAutoComplete,
};
export function addPage(page: import('./misc/Page').Page | (() => Promise<void> | void)) {
  window.Hydro.extraPages.push(page);
}

declare global {
  interface Window {
    LANGS: Record<string, any>;
    lazyloadMetadata: Record<string, string>;
    lazyModuleResolver: Record<string, any>;
  }

  let UserContext: Record<string, any>;
  let UiContext: Record<string, any>;
}

// Below are old version api compat
/* eslint-disable import/order */
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
