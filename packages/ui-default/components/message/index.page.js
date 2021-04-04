import { AutoloadPage } from 'vj/misc/Page';
import { InfoDialog } from 'vj/components/dialog';
import Notification from 'vj/components/notification';
import { FLAG_ALERT } from 'vj/constant/message';
import i18n from 'vj/utils/i18n';
import tpl from 'vj/utils/tpl';

const messagePage = new AutoloadPage('messagePage', () => {
  async function init() {
    if (UserContext.unreadMsg) {
      new Notification({
        type: 'info',
        message: i18n('You have mew message.'),
        action: () => window.open('/home/messages', '_blank'),
      }).show();
    }

    const { default: SockJs } = await import('../socket');

    const sock = new SockJs('/home/messages-conn');
    sock.onmessage = (message) => {
      const msg = JSON.parse(message.data);
      console.log('Received message', msg);
      if (msg.mdoc.flag & FLAG_ALERT) {
        // Is alert
       new InfoDialog({
          $body: tpl`
            <div class="typo">
              <p>${i18n('Message from {0}:', msg.mdoc.from)}</p>
              <p>${i18n(msg.mdoc.content)}</p>
            </div>`,
        }).open();
      } else {
        // Is message
        new Notification({
          title: msg.udoc.uname,
          avatar: msg.udoc.gravatar_url,
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
