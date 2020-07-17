import SockJS from 'sockjs-client';
import Notification from 'vj/components/notification/index';
import i18n from 'vj/utils/i18n';

export default class Sock {
  constructor(url) {
    this.url = url;
    this.isreconnect = false;
    this.init();
    this.notification = null;
  }

  init() {
    this.sock = new SockJS(this.url);
    this.sock.onopen = () => {
      if (this.isreconnect) {
        this.notification.hide();
        Notification.info(i18n('Reconnected to the server.'));
      }
      if (this.onopen) this.onopen(this.isreconnect);
    };
    this.sock.onclose = (code, reason) => {
      console.warn('Connection closed, ', code, reason);
      if (this.closed) {
        if (this.onclose) this.onclose(code, reason);
        return;
      }
      if (!this.closed) {
        if (!this.notification) {
          this.notification = new Notification({
            message: i18n('Disconnected from the server. Reconnecting...'),
            type: 'warn',
            duration: 0,
            action: this.init.bind(this),
          });
          console.log(this.notification);
        }
        this.isreconnect = setTimeout(() => { this.init(); }, 3000);
      } else {
        if (this.notification) this.notification.hide();
        Notification.warn(i18n('Disconnected from the server.'));
      }
      if (this.onclose) this.onclose(code, reason);
    };
    this.sock.onmessage = (message) => {
      if (process.env.NODE_ENV !== 'production') console.log('Sock.onmessage: ', message);
      const msg = JSON.parse(message);
      if (msg.error === 'PermissionError' || msg.error === 'PrivilegeError') {
        this.closed = true;
      }
      if (this.onmessage) this.onmessage(message);
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
