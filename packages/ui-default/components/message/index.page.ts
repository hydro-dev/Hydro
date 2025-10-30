import { nanoid } from 'nanoid';
import { InfoDialog } from 'vj/components/dialog';
import VjNotification from 'vj/components/notification/index';
import {
  FLAG_ALERT, FLAG_I18N, FLAG_INFO, FLAG_RICHTEXT,
} from 'vj/constant/message';
import { AutoloadPage } from 'vj/misc/Page';
import { i18n, tpl } from 'vj/utils';
import Sock from '../socket';

let previous: VjNotification;
const processI18n = (msg) => {
  if (msg.mdoc.flag & FLAG_I18N) {
    try {
      msg.mdoc.content = JSON.parse(msg.mdoc.content);
      if (msg.mdoc.content.url) msg.mdoc.url = msg.mdoc.content.url;
      if (msg.mdoc.content.avatar) msg.mdoc.avatar = msg.mdoc.content.avatar;
      msg.mdoc.content = i18n(msg.mdoc.content.message, ...msg.mdoc.content.params);
    } catch (e) {
      msg.mdoc.content = i18n(msg.mdoc.content);
    }
  }
  return msg;
};
const onmessage = (msg) => {
  console.log('Received message', msg);
  msg = processI18n(msg);
  if (msg.mdoc.flag & FLAG_ALERT) {
    // Is alert
    new InfoDialog({
      cancelByClickingBack: false,
      $body: tpl`
        <div class="typo">
          ${{ templateRaw: true, html: i18n('Message from {0}:', `<div data-user>${msg.mdoc.from}</div>`) }}
          <p>${i18n(msg.mdoc.content)}</p>
        </div>`,
    }).open();
    return false;
  }
  if (msg.mdoc.flag & FLAG_INFO) {
    if (previous) previous.hide();
    previous = new VjNotification({
      message: msg.mdoc.content,
      duration: 3000,
    });
    previous.show();
    return false;
  }
  if (document.hidden) return false;
  // Is message
  new VjNotification({
    ...(msg.udoc._id === 1)
      ? {
        type: 'info',
        message: msg.mdoc.flag & FLAG_RICHTEXT ? i18n('You received a system message, click here to view.') : msg.mdoc.content,
        ...(msg.mdoc.avatar ? { avatar: msg.mdoc.avatar } : {}),
      } : {
        title: msg.udoc.uname,
        avatar: msg.udoc.avatarUrl,
        message: msg.mdoc.content,
      },
    duration: 15000,
    action: () => window.open(msg.mdoc.url ? msg.mdoc.url : `/home/messages?uid=${msg.udoc._id}`, '_blank'),
  }).show();
  return true;
};

const initWorkerMode = (endpoint) => {
  console.log('Messages: using SharedWorker');
  const worker = new SharedWorker(new URL('./worker.ts', import.meta.url), { name: 'HydroMessagesWorker' });
  worker.port.start();
  window.addEventListener('beforeunload', () => {
    worker.port.postMessage({ type: 'unload' });
  });
  worker.port.postMessage({ type: 'conn', path: endpoint, cookie: document.cookie });
  worker.port.onmessage = async (message) => {
    if (process.env.NODE_ENV !== 'production') console.log('onmessage: ', message);
    const { payload, type } = message.data;
    if (type === 'message') {
      if (onmessage(payload)) worker.port.postMessage({ type: 'ack', id: payload.mdoc._id });
    } else if (type === 'i18n') {
      worker.port.postMessage({ type: 'ack', id: `${payload.mdoc._id}-i18n`, payload: processI18n(payload) });
    } else if (type === 'open-page') {
      console.log('opening page');
      window.open('/home/messages');
    }
  };
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
  const url = new URL(`${UiContext.ws_prefix}websocket`, window.location.href);
  const endpoint = url.toString().replace('http', 'ws');
  if (window.SharedWorker) {
    try {
      initWorkerMode(endpoint);
      return;
    } catch (e) {
      console.error('SharedWorker init fail: ', e.message);
    }
  }
  if (!window.BroadcastChannel) {
    console.error('BoardcastChannel not supported');
    return;
  }

  console.log('Messages: using BroadcastChannel');
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
    channel.postMessage({ type: 'master' });
  };

  function asMaster() {
    console.log('init as master');
    isMaster = true;
    localStorage.setItem('page.master', selfId);
    const masterChannel = new BroadcastChannel('hydro-messages');
    const sock = new Sock(endpoint);
    sock.onopen = () => {
      sock.send(JSON.stringify({
        operation: 'subscribe',
        request_id: Math.random().toString(16).substring(2),
        credential: document.cookie.split('sid=')[1].split(';')[0],
        channels: ['message'],
      }));
    };
    sock.onmessage = async (message) => {
      const payload = JSON.parse(message.data);
      if (payload.operation === 'event') {
        masterChannel.postMessage({ type: 'message', payload: payload.payload });
      }
    };
  }

  channel.onmessage = (msg) => {
    if (msg.data.type === 'message' && !document.hidden) {
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
