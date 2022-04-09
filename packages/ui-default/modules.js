import $ from 'jquery';
import _ from 'lodash';

import './utils/delay';
import './utils/emulateAnchorClick';
import './utils/i18n';
import './utils/loadReactRedux';
import './utils/mediaQuery';
import './utils/mongoId';
import './utils/parseQueryString';
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
import './components/nprogress';
import './components/monaco/loader';

window.node_modules = { _, $ };
window.$ = $;
window.jQuery = $;
