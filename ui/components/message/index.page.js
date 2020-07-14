import { AutoloadPage } from 'vj/misc/PageLoader';
import Notification from 'vj/components/notification';
import i18n from 'vj/utils/i18n';

const messagePage = new AutoloadPage('messagePage', () => {
  async function init(isReconnect = false) {
    const { default: SockJs } = await import('sockjs-client');

    const sock = new SockJs(`/home/messages-conn?token=${UiContext.token}`);
    sock.onopen = () => {
      if (isReconnect) Notification.info('Reconnected');
    };
    sock.onmessage = (message) => {
      const msg = JSON.parse(message.data);
      console.log(msg);
      Notification.show({ title: msg.udoc.uname, message: msg.mdoc.content, duration: 0 });
    };
    sock.onclose = () => {
      Notification.warn(i18n('Disconnected from the server. Reconnecting...'));
      setTimeout(() => {
        init(true);
      }, 3000);
    };
  }

  if (UserContext._id !== 0) init();
});

export default messagePage;
