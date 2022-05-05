import { AutoloadPage } from 'vj/misc/Page';
import { InfoDialog } from 'vj/components/dialog';
import VjNotification from 'vj/components/notification/index';
import ReconnectingWebsocket from 'reconnecting-websocket';
import { FLAG_ALERT } from 'vj/constant/message';
import i18n from 'vj/utils/i18n';
import tpl from 'vj/utils/tpl';
import { nanoid } from 'nanoid';

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

  let isMaster = false;
  const selfId = nanoid();
  const channel = new BroadcastChannel('hydro-messages');
  const pages = JSON.parse(localStorage.getItem('pages') || '[]') as string[];
  pages.push(selfId);
  pages.sort();
  localStorage.setItem('pages', JSON.stringify(pages));

  window.onunload = () => {
    const c = JSON.parse(localStorage.getItem('pages') || '[]') as string[];
    localStorage.setItem('pages', JSON.stringify(c.filter((i) => i !== selfId)));
    if (!isMaster) return;
    localStorage.removeItem('page.master');
    channel?.postMessage({ type: 'master' });
  };

  function asMaster() {
    console.log('init as master');
    isMaster = true;
    localStorage.setItem('page.master', selfId);
    const masterChannel = new BroadcastChannel('hydro-messages');
    const url = new URL('/home/messages-conn', window.location.href.replace('http', 'ws'));
    // TODO handle a better way for cookie
    url.searchParams.append('sid', document.cookie);
    const sock = new ReconnectingWebsocket(url.toString());
    const pending = {};
    sock.onopen = () => console.log('Connected');
    sock.onerror = console.error;
    sock.onclose = (...args) => console.log('Closed', ...args);
    sock.onmessage = async (message) => {
      if (process.env.NODE_ENV !== 'production') console.log('onmessage: ', message);
      const payload = JSON.parse(message.data);
      const id = nanoid();
      masterChannel.postMessage({ type: 'message', id, payload });
      const success = await new Promise<boolean>((resolve) => {
        pending[id] = resolve;
        setTimeout(() => {
          delete pending[id];
          resolve(false);
        }, 1000);
      });
      if (!success && window.Notification?.permission === 'granted') {
        const notification = new window.Notification(
          payload.udoc.uname || 'Hydro Notification',
          {
            icon: payload.udoc.avatarUrl || '/android-chrome-192x192.png',
            body: payload.mdoc.content,
          },
        );
        notification.onclick = () => window.open('/home/messages');
      }
    };
    masterChannel.onmessage = (msg) => {
      if (msg.data.type === 'message-push') pending[msg.data.id]?.(true);
    };
  }

  channel.onmessage = (msg) => {
    if (msg.data.type === 'message' && !document.hidden) {
      channel.postMessage({ type: 'message-push', id: msg.data.id });
      onmessage(msg.data.payload);
    }
    if (msg.data.type === 'master') {
      const c = JSON.parse(localStorage.getItem('pages') || '[]') as string[];
      if (c[0] === selfId) asMaster();
    }
  };
  if (!localStorage.getItem('page.master')) asMaster();
});

export default messagePage;
