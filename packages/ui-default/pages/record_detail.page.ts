import $ from 'jquery';
import { NamedPage } from 'vj/misc/Page';

const page = new NamedPage('record_detail', async () => {
  if (!UiContext.socketUrl) return;
  const [{ default: WebSocket }, { DiffDOM }] = await Promise.all([
    import('../components/socket'),
    import('diff-dom'),
  ]);

  const sock = new WebSocket(UiContext.ws_prefix + UiContext.socketUrl, false, true);
  const dd = new DiffDOM();
  sock.onmessage = (_, data) => {
    const msg = JSON.parse(data);
    const newStatus = $(msg.status_html);
    const oldStatus = $('#status');
    dd.apply(oldStatus[0], dd.diff(oldStatus[0], newStatus[0]));
    const newSummary = $(msg.summary_html);
    const oldSummary = $('#summary');
    dd.apply(oldSummary[0], dd.diff(oldSummary[0], newSummary[0]));
    if (typeof msg.status === 'number' && window.parent) window.parent.postMessage({ status: msg.status });
  };
});

export default page;
