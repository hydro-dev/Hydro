import $ from 'jquery';
import WebSocket from 'reconnecting-websocket';
import Notification from 'vj/components/notification/index';
import i18n from 'vj/utils/i18n';
import tpl from 'vj/utils/tpl';

const notification = tpl`<div style="position: fixed; left: 0px; bottom: -100px; width: 100%; \
background: rgb(255, 241, 184); z-index: 2147483647; color: rgb(97, 52, 0); \
text-align: center; font-size: 18px; font-family: Consolas, Menlo, Courier, monospace; \
padding: 8px 0px; box-shadow: rgba(0, 0, 0, 0.1) 0px 4px 8px;" id="disconnect_notification" \
>${i18n('Disconnected from the server, trying to reconnect...')}</div>`;

const $el = $(notification);
$el.appendTo('body');
$el.hide();
function create() {
  $el.show();
  $el.animate({ bottom: 0 }, 100);
}
function remove() {
  $el.animate({ bottom: -100 }, 100, () => $el.remove());
}

export default class Sock {
  constructor(url, showNotification = true, useShared = false) {
    const _url = new URL(url, window.location.href);
    _url.protocol = window.location.protocol === 'https' ? 'wss' : 'ws';
    this.url = _url.toString();
    this.shared = false;
    if (useShared && window.SharedWorker) this.initShared();
    else this.init();
    this.showNotification = showNotification;
  }

  get closed() {
    return this.sock?.readyState === WebSocket.CLOSED;
  }

  init() {
    this.sock = new WebSocket(this.url);
    this.sock.onclose = ({ code, reason }) => {
      console.warn('Connection closed, ', code, reason);
      if (code >= 4000) this.close();
      else if (this.showNotification) create();
      if (this.onclose) this.onclose(code, reason);
    };
    this.sock.onmessage = (message) => {
      if (process.env.NODE_ENV !== 'production') console.log('Sock.onmessage: ', message);
      const msg = JSON.parse(message.data);
      if (['PermissionError', 'PrivilegeError'].includes(msg.error)) {
        if (this.showNotification) Notification.info(i18n('Connect fail: Permission denied.'));
        this.close();
      } else if (this.onmessage) this.onmessage(message);
    };
    this.sock.onopen = () => {
      remove();
      if (this.onopen) this.onopen(this.sock);
    };
  }

  initShared() {
    this.shared = true;
    const worker = new SharedWorker('/sharedworker.js', { name: 'Hydro Shared Connections Worker' });
    worker.port.start();
    worker.port.postMessage({ type: 'sharedConn', path: this.url, cookie: document.cookie });
    worker.port.onmessage = (e) => {
      if (e.data.type === 'message') this.onmessage({ data: e.data.payload });
    };
    this.worker = worker;
  }

  send(data) {
    this.sock.send(data);
  }

  close() {
    if (!this.shared) this.sock.close();
  }
}
