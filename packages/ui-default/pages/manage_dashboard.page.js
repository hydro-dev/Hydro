import $ from 'jquery';
import { NamedPage } from 'vj/misc/Page';

const page = new NamedPage('manage_dashboard', async () => {
  const { default: WebSocket } = await import('../components/socket');

  const sock = new WebSocket(`${UiContext.ws_prefix}manage/check-conn`);
  sock.onopen = () => {
    $('<blockquote class="blue"><p>Connection opened.</p></blockquote>').appendTo('#messages');
  };

  sock.onmessage = (message) => {
    const msg = JSON.parse(message.data);
    const color = {
      log: 'blue',
      warn: 'yellow',
      error: 'red',
    };
    const div = $(`<blockquote class="${color[msg.type]}">`).appendTo('#messages');
    // message come from backend checks, mark as trusted
    for (const line of (msg.payload || '').split('\n')) $(`<p>${line}</p>`).appendTo(div);
  };

  sock.onclose = (message) => {
    $(`
    <blockquote class="yellow">
      <p>Connection closed,reason=${JSON.stringify(message.reason)}</p>
    </blockquote>
    `).appendTo('#messages');
  };
});

export default page;
