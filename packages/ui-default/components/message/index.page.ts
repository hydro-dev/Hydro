import { AutoloadPage } from 'vj/misc/Page';
import { InfoDialog } from 'vj/components/dialog';
import VjNotification from 'vj/components/notification/index';
import ReconnectingWebsocket from 'reconnecting-websocket';
import { FLAG_ALERT } from 'vj/constant/message';
import i18n from 'vj/utils/i18n';
import tpl from 'vj/utils/tpl';
import { nanoid } from 'nanoid';
import sleep from 'vj/utils/delay';

function asMaster() {
  console.log('init as master');
  const channel = new BroadcastChannel('hydro-messages');
  const interval = setInterval(() => channel.postMessage({ type: 'master' }), 5000);
  const url = new URL('/home/messages-conn', window.location.href.replace('http', 'ws'));
  url.searchParams.append('sid', document.cookie);
  const sock = new ReconnectingWebsocket(url.toString());
  function destory() {
    sock.close();
    channel.close();
    clearInterval(interval);
  }
  const pending = {};
  sock.onopen = () => console.log('Connected');
  sock.onerror = console.error;
  sock.onclose = (...args) => console.log('Closed', ...args);
  sock.onmessage = async (message) => {
    if (process.env.NODE_ENV !== 'production') console.log('onmessage: ', message);
    const payload = JSON.parse(message.data);
    if (['PermissionError', 'PrivilegeError'].includes(payload.error)) {
      destory();
      return;
    }
    const id = nanoid();
    channel.postMessage({ type: 'message', id, payload });
    const success = await new Promise<boolean>((resolve) => {
      pending[id] = resolve;
      setTimeout(() => {
        delete pending[id];
        resolve(false);
      }, 1000);
    });
    if (!success && window.Notification?.permission === 'granted') {
      // eslint-disable-next-line no-new
      new window.Notification(
        payload.udoc.uname || 'Hydro Notification',
        {
          icon: payload.udoc.avatarUrl || '/android-chrome-192x192.png',
          body: payload.mdoc.content,
        },
      );
    }
  };
  channel.onmessage = (msg) => {
    if (msg.data.type === 'message-push') pending[msg.data.id]?.(true);
  };
}

const onmessage = (msg) => {
  console.log('Received message', msg);
  if (msg.mdoc.flag & FLAG_ALERT) {
    // Is alert
    return new InfoDialog({
      cancelByClickingBack: false,
      $body: tpl`
        <div class="typo">
          ${{ templateRaw: true, html: i18n('Message from {0}:', `<div data-user>${msg.mdoc.from}</div>`) }}
          <p>${i18n(msg.mdoc.content)}</p>
        </div>`,
    }).open();
  }
  // Is message
  return new VjNotification({
    ...(msg.udoc._id === 1 && msg.mdoc.flag & 4)
      ? { message: i18n('You received a system message, click here to view.') }
      : {
        title: msg.udoc.uname,
        avatar: msg.udoc.avatarUrl,
        message: msg.mdoc.content,
      },
    duration: 15000,
    action: () => window.open(`/home/messages?uid=${msg.udoc._id}`, '_blank'),
  }).show();
};

async function asSlave() {
  console.log('message load as slave');
  const channel = new BroadcastChannel('hydro-messages');
  const selfId = nanoid();
  setInterval(() => channel.postMessage({ type: 'node', id: selfId }), 5000);
  let alive = false;
  let nodes = new Set<string>([selfId]);
  channel.onmessage = (msg) => {
    if (msg.data.target && msg.data.target !== selfId) return;
    if (msg.data.type === 'master') alive = true;
    if (msg.data.type === 'node') nodes.add(msg.data.id);
    if (msg.data.type === 'message') {
      if (!document.hidden) {
        channel.postMessage({ type: 'message-push', id: msg.data.id });
        onmessage(msg.data.payload);
      }
    }
  };
  while (true) { // eslint-disable-line no-constant-condition
    alive = false;
    nodes = new Set<string>([selfId]);
    await sleep(7000);
    if (!alive && Array.from(nodes).sort()[0] === selfId) asMaster();
  }
}

const messagePage = new AutoloadPage('messagePage', (pagename) => {
  if (pagename === 'home_messages' || !UserContext._id) return;
  if (UserContext.unreadMsg) {
    new VjNotification({
      type: 'info',
      message: i18n(`You have ${UserContext.unreadMsg > 1 ? 'new messages' : 'a new message'}.`),
      duration: 5000,
      action: () => window.open('/home/messages', '_blank'),
    }).show();
  }
  if (!window.BroadcastChannel) {
    console.error('BoardcastChannel not supported');
    return;
  }
  asSlave();
});

export default messagePage;
