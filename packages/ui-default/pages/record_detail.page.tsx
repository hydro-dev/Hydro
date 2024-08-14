import $ from 'jquery';
import React from 'react';
import { InfoDialog } from 'vj/components/dialog';
import { NamedPage } from 'vj/misc/Page';
import { tpl, withTransistionCallback } from 'vj/utils';

export default new NamedPage('record_detail', async () => {
  $(document).on('click', '.compiler-text', () => {
    withTransistionCallback(() => {
      $('.collapsed').removeClass('collapsed');
    });
  });
  $(document).on('click', '.subtask-case', function () {
    const text = $(this).find('.message').text();
    const data = $(this).find('.message').html();
    if (!text?.trim()) return;
    new InfoDialog({
      $body: tpl(<pre dangerouslySetInnerHTML={{ __html: data }} />),
    }).open();
  });

  if (!UiContext.socketUrl) return;
  const [{ default: WebSocket }, { DiffDOM }] = await Promise.all([
    import('../components/socket'),
    import('diff-dom'),
  ]);

  const sock = new WebSocket(UiContext.ws_prefix + UiContext.socketUrl, false, true);
  const dd = new DiffDOM();
  sock.onmessage = (_, data) => {
    const msg = JSON.parse(data);
    if (typeof msg.status === 'number' && window.parent) window.parent.postMessage({ status: msg.status });
    withTransistionCallback(() => {
      const newStatus = $(msg.status_html);
      const oldStatus = $('#status');
      dd.apply(oldStatus[0], dd.diff(oldStatus[0], newStatus[0]));
      const newSummary = $(msg.summary_html);
      const oldSummary = $('#summary');
      dd.apply(oldSummary[0], dd.diff(oldSummary[0], newSummary[0]));
    });
  };
});
