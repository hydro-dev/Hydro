/* eslint-disable import/first */
export * from './components/dialog';
export { default as loadMonaco } from './components/monaco/loader';
export { default as Notification } from './components/notification';
export { default as selectUser } from './components/selectUser';
export { default as Socket } from './components/socket/index';
export { default as uploadFiles } from './components/upload';
export * from './components/zipDownloader';
export { default as download } from './components/zipDownloader';
export { Context, ctx, Service } from './context';
export { initPageLoader } from './hydro';
export * from './lazyload';
export * from './misc/Page';
export * from './utils';
export * from '@hydrooj/utils/lib/common';
export { AnsiUp } from 'ansi_up';
export { default as $ } from 'jquery';
export { default as _ } from 'lodash';
export { default as React } from 'react';
export * as redux from 'react-redux';
export { default as jsxRuntime } from 'react/jsx-runtime';
import ReactDOMMain from 'react-dom';
import ReactDOMClient from 'react-dom/client';
import { load } from './lazyload';

Object.assign(ReactDOMMain, ReactDOMClient);

export const ReactDOM = ReactDOMMain as typeof ReactDOMMain & typeof ReactDOMClient;
export default load;
export interface EventMap { }

import AutoComplete from './components/autocomplete';
import AssignSelectAutoComplete from './components/autocomplete/AssignSelectAutoComplete';
import CustomSelectAutoComplete from './components/autocomplete/CustomSelectAutoComplete';
import DomainSelectAutoComplete from './components/autocomplete/DomainSelectAutoComplete';
import ProblemSelectAutoComplete from './components/autocomplete/ProblemSelectAutoComplete';
import UserSelectAutoComplete from './components/autocomplete/UserSelectAutoComplete';

export {
  AssignSelectAutoComplete, AutoComplete, CustomSelectAutoComplete, DomainSelectAutoComplete, ProblemSelectAutoComplete, UserSelectAutoComplete,
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

Object.assign(window, { $, jQuery: $ });
