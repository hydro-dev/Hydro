import { AutoloadPage } from 'vj/misc/Page';
import { InfoDialog } from 'vj/components/dialog';
import VjNotification from 'vj/components/notification/index';
import { FLAG_ALERT } from 'vj/constant/message';
import i18n from 'vj/utils/i18n';
import tpl from 'vj/utils/tpl';

const messagePage = new AutoloadPage('messagePage', (pagename) => {
  if (pagename === 'home_messages') return;
  let visible = true;
  document.addEventListener('visibilitychange', () => {
    const state = document.visibilityState;
    if (state === 'hidden' && visible) visible = false;
    if (state === 'visible' && !visible) visible = true;
  });

  async function init() {
    if (UserContext.unreadMsg) {
      new VjNotification({
        type: 'info',
        message: i18n(`You have ${UserContext.unreadMsg > 1 ? 'new messages' : 'a new message'}.`),
        duration: 5000,
        action: () => window.open('/home/messages', '_blank'),
      }).show();
    }

    const { default: SockJs } = await import('../socket');

    const sock = new SockJs('/home/messages-conn', true, true);
    sock.onmessage = (message) => {
      const msg = JSON.parse(message.data);
      console.log('Received message', msg);
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
      } else if (msg.udoc._id === 1 && msg.mdoc.flag & 4) {
        new VjNotification({
          message: 'You received a system message, click here to view.',
          duration: 15000,
          action: () => window.open(`/home/messages?uid=${msg.udoc._id}`, '_blank'),
        }).show();
      } else {
        // Is message
        new VjNotification({
          title: msg.udoc.uname,
          avatar: msg.udoc.avatarUrl,
          message: msg.mdoc.content,
          duration: 15000,
          action: () => window.open(`/home/messages?uid=${msg.udoc._id}`, '_blank'),
        }).show();
      }
    };
  }

  if (UserContext._id !== 0) init();
});

export default messagePage;
