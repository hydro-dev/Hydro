import SockJS from 'sockjs-client';
import Notification from 'vj/components/notification';
import i18n from 'vj/utils/i18n';

export default class Sock {
  constructor(url) {
    this.url = url;
    this.reconnect = false;
    this.init();
  }

  init() {
    this.sock = new SockJS(this.url);
    this.sock.onopen = () => {
      if (this.reconnect) Notification.warn(i18n('Reconnected to the server.'));
      if (this.onopen) this.onopen(this.reconnect);
    };
    this.sock.onclose = (code, reason) => {
      console.warn('Connection closed, ', code, reason);
      if (this.closed) {
        if (this.onclose) this.onclose(code, reason);
        return;
      }
      Notification.warn(i18n('Disconnected from the server. Reconnecting...'));
      this.reconnect = setTimeout(() => { this.init(); }, 3000);
      if (this.onclose) this.onclose(code, reason);
    };
    this.sock.onmessage = (message) => {
      if (process.env.NODE_ENV !== 'production') console.log('Sock.onmessage: ', message);
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
