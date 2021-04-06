import { AutoloadPage } from 'vj/misc/Page';
import Notification from 'vj/components/notification/index';

export default new AutoloadPage('notificationPage', () => {
    const text = new URL(window.location.href).searchParams.get('notification');
    if (text) Notification.success(text);
});
