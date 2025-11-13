import './polyfill';

import $ from 'jquery';

window.Hydro = {
  extraPages: [],
  components: {},
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
try {
  __webpack_public_path__ = UiContext.cdn_prefix;
} catch (e) { }
if ('serviceWorker' in navigator) {
  navigator.serviceWorker.register('/service-worker.js').then((registration) => {
    console.log('SW registered: ', registration);
    fetch('/service-worker-config', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(UiContext.SWConfig),
    });
  }).catch((registrationError) => {
    console.log('SW registration failed: ', registrationError);
  });
}

const PageLoader = '<div class="page-loader nojs--hide" style="display:none;"><div class="loader"></div></div>';
$('body').prepend(PageLoader);
$('.page-loader').fadeIn(500);
if (process.env.NODE_ENV === 'production' && UiContext.sentry_dsn) {
  window._sentryEvents = [];
  window.captureException = (e) => {
    if (!e.isUserFacingError) window._sentryEvents.push(e);
  };
  const script = document.createElement('script');
  script.src = '/sentry.js';
  document.body.appendChild(script);
}

document.addEventListener('DOMContentLoaded', async () => {
  Object.assign(window.UiContext, JSON.parse(window.UiContextNew));
  Object.assign(window.UserContext, JSON.parse(window.UserContextNew));
  window.HydroExports = await import('./api');
  await window._hydroLoad();
  await window.HydroExports.initPageLoader();
}, false);
