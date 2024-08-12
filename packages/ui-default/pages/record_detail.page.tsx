import $ from 'jquery';
import React from 'react';
import { createRoot } from 'react-dom/client';
import { NamedPage } from 'vj/misc/Page';
import { loadReactRedux, request, withTransistionCallback } from 'vj/utils';

export default new NamedPage('record_detail', async () => {
  if (!UiContext.socketUrl) return;
  const [{ default: WebSocket }, { DiffDOM }] = await Promise.all([
    import('../components/socket'),
    import('diff-dom'),
  ]);

  let reduxStore;

  async function mountComponent() {
    const [{ default: RecordDetailStatus }, { default: RecordDetailStatusReducer }] = await Promise.all([
      import('vj/components/recorddetailstatus/index'),
      import('vj/components/recorddetailstatus/reducer'),
    ]);

    const { Provider, store } = await loadReactRedux(RecordDetailStatusReducer);

    reduxStore = store;

    store.dispatch({
      type: 'RDOC_LOAD',
      payload: request.get(''),
    });

    createRoot(document.getElementById('RecordDetailStatus')!).render(
      <Provider store={store}>
        <RecordDetailStatus />
      </Provider>,
    );
  }

  function setupSock() {
    const sock = new WebSocket(UiContext.ws_prefix + UiContext.socketUrl, false, true);
    const dd = new DiffDOM();
    sock.onmessage = (_, data) => {
      const msg = JSON.parse(data);
      const {
        status, score, progress, compilerTexts, judgeTexts, testCases, subtasks,
      } = msg;
      reduxStore.dispatch({
        type: 'RDOC_UPDATE',
        payload: {
          status, score, progress, compilerTexts, judgeTexts, testCases, subtasks,
        },
      });
      if (typeof status === 'number' && window.parent) window.parent.postMessage({ status });
      withTransistionCallback(() => {
        const newSummary = $(msg.summary_html);
        const oldSummary = $('#summary');
        dd.apply(oldSummary[0], dd.diff(oldSummary[0], newSummary[0]));
      });
    };
  }

  await mountComponent();
  setupSock();
});
