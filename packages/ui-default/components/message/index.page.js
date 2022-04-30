import { AutoloadPage } from 'vj/misc/Page';
import { InfoDialog } from 'vj/components/dialog';
import VjNotification from 'vj/components/notification/index';
import { FLAG_ALERT } from 'vj/constant/message';
import i18n from 'vj/utils/i18n';
import tpl from 'vj/utils/tpl';

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

  const onmessage = (message) => {
    const msg = JSON.parse(message);
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
    if (msg.udoc._id === 1 && msg.mdoc.flag & 4) {
      // System notification
      return new VjNotification({
        message: i18n('You received a system message, click here to view.'),
        duration: 15000,
        action: () => window.open(`/home/messages?uid=${msg.udoc._id}`, '_blank'),
      }).show();
    }
    // Is message
    return new VjNotification({
      title: msg.udoc.uname,
      avatar: msg.udoc.avatarUrl,
      message: msg.mdoc.content,
      duration: 15000,
      action: () => window.open(`/home/messages?uid=${msg.udoc._id}`, '_blank'),
    }).show();
  };

  const path = new URL('/home/messages-conn', window.location.href).toString();
  const worker = new SharedWorker('/sharedworker.js', { name: 'Hydro Messages Shared Worker' });
  worker.port.start();
  worker.port.postMessage({ type: 'init', path, cookie: document.cookie });
  worker.port.onmessage = (e) => {
    if (e.data.type !== 'message') return;
    if (document.hidden) {
      worker.port.postMessage({ type: 'fail' });
    } else {
      worker.port.postMessage({ type: 'success' });
      onmessage(e.data.payload);
    }
  };
});

export default messagePage;
