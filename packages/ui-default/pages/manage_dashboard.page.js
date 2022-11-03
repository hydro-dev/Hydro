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
    if (msg.type === 'log') {
      const div = $('<blockquote class="blue">').appendTo('#messages');
      $(`<p>${msg.payload}</p>`).appendTo(div);
    } else if (msg.type === 'warn') {
      const div = $('<blockquote class="yellow">').appendTo('#messages');
      $(`<p>${msg.payload}</p>`).appendTo(div);
    } else if (msg.type === 'error') {
      const div = $('<blockquote class="red">').appendTo('#messages');
      $(`<p>${msg.payload}</p>`).appendTo(div);
    }
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
