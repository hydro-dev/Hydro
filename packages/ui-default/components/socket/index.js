import ReconnectingWebSocket from 'reconnecting-websocket';

export default class Sock {
  constructor(url) {
    const i = new URL(url, window.location.href);
    if (i.host !== window.location.host) i.searchParams.append('sid', document.cookie.split('sid=')[1].split(';')[0]);
    i.protocol = i.protocol.replace('http', 'ws');
    this.url = i.toString();
    this.sock = new ReconnectingWebSocket(this.url);
    this.sock.onopen = () => {
      console.log('Connected');
      this.onopen?.(this.sock);
    };
    this.sock.onclose = ({ code, reason }) => {
      console.warn('Connection closed, ', code, reason);
      if (code >= 4000) this.close();
      this.onclose?.(code, reason);
    };
    this.sock.onmessage = (message) => {
      if (process.env.NODE_ENV !== 'production') console.log('Sock.onmessage: ', message);
      const msg = JSON.parse(message.data);
      if (msg.error === 'PermissionError' || msg.error === 'PrivilegeError') this.close();
      else this.onmessage?.(message);
    };
  }

  send(data) {
    this.sock.send(data);
  }

  close() {
    this.sock?.close?.();
  }
}
