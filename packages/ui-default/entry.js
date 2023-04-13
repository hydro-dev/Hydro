import $ from 'jquery';

window.Hydro = {
  extraPages: [],
  components: {},
  utils: {},
  node_modules: {},
  version: process.env.VERSION,
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

window.UiContext = JSON.parse(window.UiContext);
window.UserContext = JSON.parse(window.UserContext);
try { __webpack_public_path__ = UiContext.cdn_prefix; } catch (e) { }
if ('serviceWorker' in navigator) {
  const encodedConfig = encodeURIComponent(JSON.stringify(UiContext.SWConfig));
  navigator.serviceWorker.register(`/service-worker.js?config=${encodedConfig}`).then((registration) => {
    console.log('SW registered: ', registration);
  }).catch((registrationError) => {
    console.log('SW registration failed: ', registrationError);
  });
}

const PageLoader = '<div class="page-loader nojs--hide" style="display:none;"><div class="loader"></div></div>';
$('body').prepend(PageLoader);
$('.page-loader').fadeIn(500);

const prefetch = Promise.all([
  fetch(`/constant/${UiContext.constantVersion}.js`).then((r) => r.text()),
  import('./api'),
]);

document.addEventListener('DOMContentLoaded', async () => {
  Object.assign(window.UiContext, JSON.parse(window.UiContextNew));
  Object.assign(window.UserContext, JSON.parse(window.UserContextNew));
  const [data, HydroExports] = await prefetch;
  Object.assign(window, { HydroExports });
  eval(data); // eslint-disable-line no-eval
  await HydroExports.initPageLoader();
}, false);
