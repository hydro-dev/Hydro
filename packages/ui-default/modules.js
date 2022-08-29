import './utils/delay';
import './utils/emulateAnchorClick';
import './utils/i18n';
import './utils/loadReactRedux';
import './utils/mediaQuery';
import './utils/mongoId';
import './utils/pipeStream';
import './utils/pjax';
import './utils/request';
import './utils/slide';
import './utils/substitute';
import './utils/tpl';
import './utils/zIndexManager';
import './utils/zip';
import './components/autocomplete';
import './components/dialog';
import './components/notification';
import './components/monaco/loader';

import $ from 'jquery';
import _ from 'lodash';
import React from 'react';
import ReactDOM from 'react-dom/client';
import * as redux from 'react-redux';

const modules = {
  _, $, React, redux, ReactDOM,
};
export default async function load(name) {
  if (modules[name]) return modules[name];
  if (name === 'echarts') return import('echarts');
  if (name === 'moment') return import('moment');
  throw new Error(`Module ${name} not found`);
}
window.node_modules = { ...modules, load };
window.$ = $;
window.jQuery = $;
