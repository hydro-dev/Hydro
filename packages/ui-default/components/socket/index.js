import SockJS from 'sockjs-client';
import Notification from 'vj/components/notification/index';
import i18n from 'vj/utils/i18n';

export default class Sock {
  constructor(url, showNotification = true) {
    this.url = url;
    this.isreconnect = false;
    this.init();
    this.notification = null;
    this.showNotification = showNotification;
  }

  onauth() {
    // SockJS wouldn't send cookie. hack.
    if (this.isreconnect) {
      this.notification.hide();
      if (this.showNotification) Notification.info(i18n('Reconnected to the server.'));
    }
    if (this.onopen) this.onopen(this.sock);
  }

  init() {
    this.sock = new SockJS(this.url);
    this.sock.onopen = () => {
      this.send(document.cookie);
    };
    this.sock.onclose = ({ code, reason }) => {
      console.warn('Connection closed, ', code, reason);
      if (code >= 4000) this.closed = true;
      if (!this.closed) {
        if (this.showNotification && !this.notification) {
          this.notification = new Notification({
            message: i18n('Disconnected from the server. Reconnecting...'),
            type: 'warn',
            duration: 0,
            action: this.init.bind(this),
          });
        }
        this.isreconnect = setTimeout(this.init.bind(this), 3000);
      } else {
        if (this.notification) this.notification.hide();
        if (this.showNotification) Notification.warn(i18n('Disconnected from the server.'));
      }
      if (this.onclose) this.onclose(code, reason);
    };
    this.sock.onmessage = (message) => {
      if (process.env.NODE_ENV !== 'production') console.log('Sock.onmessage: ', message);
      const msg = JSON.parse(message.data);
      if (msg.event === 'auth') {
        if (msg.error === 'PermissionError' || msg.error === 'PrivilegeError') {
          if (this.showNotification) Notification.info(i18n('Connect fail: Permission denied.'));
          this.closed = true;
        } else this.onauth();
      } else if (this.onmessage) this.onmessage(message);
    };
  }

  send(data) {
    this.sock.send(data);
  }

  close() {
    this.closed = true;
    this.sock.close();
  }
}
