import SockJS from 'sockjs-client';
import $ from 'jquery';
import Notification from 'vj/components/notification/index';
import i18n from 'vj/utils/i18n';
import tpl from 'vj/utils/tpl';

const notification = tpl`<div style="position: fixed; left: 0px; bottom: -30px; width: 100%; \
background: rgb(255, 241, 184); z-index: 2147483647; color: rgb(97, 52, 0); \
text-align: center; font-size: 18px; font-family: Consolas, Menlo, Courier, monospace; \
padding: 8px 0px; box-shadow: rgba(0, 0, 0, 0.1) 0px 4px 8px;" id="disconnect_notification" \
>${i18n('Disconnected from the server, trying to reconnect...')}</div>`;

const $el = $(notification);
$el.appendTo('body');
function create() {
  $el.animate({ bottom: 0 }, 500);
}
function remove() {
  $el.animate({ bottom: -30 }, 300);
}

export default class Sock {
  constructor(url, showNotification = true) {
    this.url = url;
    this.isreconnect = false;
    this.init();
    this.showNotification = showNotification;
  }

  onauth() {
    remove();
    if (this.onopen) this.onopen(this.sock);
  }

  init() {
    this.sock = new SockJS(this.url);
    // SockJS wouldn't send cookie. hack.
    this.sock.onopen = () => this.send(document.cookie);
    this.sock.onclose = ({ code, reason }) => {
      console.warn('Connection closed, ', code, reason);
      if (code >= 4000) this.closed = true;
      if (!this.closed) {
        if (this.showNotification) create();
        this.isreconnect = setTimeout(this.init.bind(this), 3000);
      } else if (this.showNotification) create();
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
