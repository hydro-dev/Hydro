import Notification from 'vj/components/notification/index';
import { AutoloadPage } from 'vj/misc/Page';
import { i18n } from 'vj/utils';

export default new AutoloadPage('notificationPage', (pagename) => {
  const message = i18n(`Hint::Page::${pagename}`);
  const item = localStorage.getItem(`hint.${message}`);
  if (message !== `Hint::Page::${pagename}` && !item) {
    Notification.info(message, message.length * 500);
    localStorage.setItem(`hint.${message}`, true);
  }
  const text = new URL(window.location.href).searchParams.get('notification');
  if (text) Notification.success(text);
});
