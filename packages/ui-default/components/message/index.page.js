import { AutoloadPage } from 'vj/misc/Page';
import { InfoDialog } from 'vj/components/dialog';
import Notification from 'vj/components/notification';
import { FLAG_ALERT } from 'vj/constant/message';
import i18n from 'vj/utils/i18n';
import tpl from 'vj/utils/tpl';

const messagePage = new AutoloadPage('messagePage', () => {
  async function init() {
    const { default: SockJs } = await import('../socket');

    const sock = new SockJs('/home/messages-conn');
    sock.onmessage = (message) => {
      const msg = JSON.parse(message.data);
      if (msg.mdoc.flag | FLAG_ALERT) {
        // Is alert
        const dialog = new InfoDialog({
          $body: tpl`
            <div class="typo">
              <p>${i18n(msg.udoc.content)}</p>
            </div>`,
        });
        dialog.open();
      } else {
        // Is message
        Notification.show({
          title: msg.udoc.uname,
          avatar: msg.udoc.gravatar,
          message: msg.mdoc.content,
        });
      }
    };
  }

  if (UserContext._id !== 0) init();
});

export default messagePage;
