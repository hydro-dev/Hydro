import {
  browserApiErrorsIntegration, browserTracingIntegration, captureException, init, replayIntegration, setTag,
} from '@sentry/browser';

init({
  dsn: UiContext.sentry_dsn,
  release: `hydro-web@${process.env.VERSION}`,
  integrations: [
    browserTracingIntegration(),
    browserApiErrorsIntegration(),
    replayIntegration({
      networkRequestHeaders: ['Content-Type'],
      networkResponseHeaders: ['Content-Type', 'Location'],
    }),
  ],
  tracesSampleRate: 0.1,
  tracePropagationTargets: ['localhost', /^\//, window.location.host],
  replaysSessionSampleRate: 0.01,
  replaysOnErrorSampleRate: 0.1,
});
setTag('host', window.location.host);
setTag('page_name', document.documentElement.getAttribute('data-page'));
window.captureException = (e: any) => {
  if (!e.isUserFacingError) captureException(e);
};
(window as any)._sentryEvents.forEach(captureException);
