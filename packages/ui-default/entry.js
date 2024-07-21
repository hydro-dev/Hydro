import './polyfill';

import * as Sentry from '@sentry/browser';
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
if (process.env.NODE_ENV === 'production' && !UiContext.sentry_disable) {
  window.captureException = (e) => {
    if (!e.isUserFacingError) Sentry.captureException(e);
  };
  Sentry.init({
    dsn: UiContext.sentry_dsn || 'https://2f95d53751e08c74c1af1c4b93ccaff7@sentry.hydro.ac/2',
    release: `hydro-web@${process.env.VERSION}`,
    integrations: [
      Sentry.browserTracingIntegration(),
      Sentry.browserApiErrorsIntegration(),
      Sentry.replayIntegration({
        networkRequestHeaders: ['Content-Type'],
        networkResponseHeaders: ['Content-Type', 'Location'],
      }),
    ],
    tracesSampleRate: 0.1,
    tracePropagationTargets: ['localhost', /^\//, window.location.host],
    replaysSessionSampleRate: 0.01,
    replaysOnErrorSampleRate: 0.2,
  });
  Sentry.setTag('host', window.location.host);
  Sentry.setTag('page_name', document.documentElement.getAttribute('data-page'));
}
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

document.addEventListener('DOMContentLoaded', async () => {
  Object.assign(window.UiContext, JSON.parse(window.UiContextNew));
  Object.assign(window.UserContext, JSON.parse(window.UserContextNew));
  window.HydroExports = await import('./api');
  await window._hydroLoad();
  await window.HydroExports.initPageLoader();
}, false);
