import $ from 'jquery';
import * as bus from './bus';

window.Hydro = {
  extraPages: [],
  components: {},
  utils: {},
  node_modules: {},
  version: process.env.VERSION,
  bus,
};
window.externalModules = {};
window.lazyModuleResolver = {};

console.log(
  '%c%s%c%s',
  'color:red;font-size:24px;',
  '   Welcome to\n',
  'color:blue;font-weight:bold;',
  `\
    __  __          __         
   / / / /_  ______/ /________ 
  / /_/ / / / / __  / ___/ __ \\
 / __  / /_/ / /_/ / /  / /_/ /
/_/ /_/\\__, /\\__,_/_/   \\____/ 
      /____/                   
`,
);

if ('serviceWorker' in navigator) {
  window.addEventListener('load', () => {
    navigator.serviceWorker.register('/service-worker.js').then((registration) => {
      console.log('SW registered: ', registration);
    }).catch((registrationError) => {
      console.log('SW registration failed: ', registrationError);
    });
  });
}

document.addEventListener('DOMContentLoaded', async () => {
  window.UiContext = JSON.parse(window.UiContext);

  const PageLoader = '<div class="page-loader nojs--hide" style="display:none;"><div class="loader"></div></div>';
  $('body').prepend(PageLoader);
  $('.page-loader').fadeIn(500);
  // eslint-disable-next-line camelcase
  try { __webpack_public_path__ = UiContext.cdn_prefix; } catch (e) { }

  const [data, HydroExports] = await Promise.all([
    fetch(`/constant/${UiContext.constantVersion}.js`).then((r) => r.text()),
    import('./api'),
  ]);
  Object.assign(window, { HydroExports });
  eval(data); // eslint-disable-line no-eval

  import('./hydro');
}, false);
