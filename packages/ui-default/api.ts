/* eslint-disable import/first */
export * from './utils';
export { default as Notification } from './components/notification';
export * from './components/dialog';
export { Context, Service, ctx } from './context';
export { AnsiUp } from 'ansi_up';
export { default as loadMonaco } from './components/monaco/loader';
export { default as Socket } from './components/socket/index';
export { default as uploadFiles } from './components/upload';
export * as redux from 'react-redux';
export * from './components/zipDownloader';
export * from '@hydrooj/utils/lib/common';
export { default as download } from './components/zipDownloader';
export { default as $ } from 'jquery';
export { default as _ } from 'lodash';
export { default as React } from 'react';
export { default as ReactDOM } from 'react-dom/client';
export * from './misc/Page';
export { initPageLoader } from './hydro';
export * from './lazyload';
import { load } from './lazyload';

export default load;
export interface EventMap { }

import AutoComplete from './components/autocomplete';
import CustomSelectAutoComplete from './components/autocomplete/CustomSelectAutoComplete';
import DomainSelectAutoComplete from './components/autocomplete/DomainSelectAutoComplete';
import ProblemSelectAutoComplete from './components/autocomplete/ProblemSelectAutoComplete';
import UserSelectAutoComplete from './components/autocomplete/UserSelectAutoComplete';

export {
  AutoComplete, UserSelectAutoComplete, ProblemSelectAutoComplete, DomainSelectAutoComplete, CustomSelectAutoComplete,
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

  let UserContext: Record<string, any>; // eslint-disable-line
  let UiContext: Record<string, any>; // eslint-disable-line
}

// Below are old version api compat
import $ from 'jquery';
import _ from 'lodash';
import React from 'react';
import ReactDOM from 'react-dom/client';
import * as redux from 'react-redux';

const modules = {
  _, $, React, redux, ReactDOM,
};

declare global {
  interface Window {
    node_modules: typeof modules;
  }
}

Object.assign(window, { node_modules: modules, $, jQuery: $ });
