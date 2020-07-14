import { AutoloadPage } from 'vj/misc/PageLoader';
import Notification from 'vj/components/notification';

const messagePage = new AutoloadPage('messagePage', () => {
  async function init() {
    const { default: SockJs } = await import('../socket');

    const sock = new SockJs(`/home/messages-conn?token=${UiContext.token}`);
    sock.onmessage = (message) => {
      const msg = JSON.parse(message.data);
      Notification.show({
        title: msg.udoc.uname,
        avatar: msg.udoc.gravatar,
        message: msg.mdoc.content,
        duration: 0,
      });
    };
  }

  if (UserContext._id !== 0) init();
});

export default messagePage;
