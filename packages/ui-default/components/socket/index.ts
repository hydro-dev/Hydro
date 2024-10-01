import ReconnectingWebSocket from 'reconnecting-websocket';
import { Shorty } from 'shorty.js';

export default class Sock {
  sock: ReconnectingWebSocket;
  interval: NodeJS.Timeout;

  constructor(public url: string, nocookie = false, shorty = false) {
    const i = new URL(url, window.location.href);
    if (shorty) {
      i.searchParams.append('shorty', 'on');
    }
    if (i.host !== window.location.host && !nocookie && document.cookie.includes('sid=')) {
      i.searchParams.append('sid', document.cookie.split('sid=')[1].split(';')[0]);
    }
    i.protocol = i.protocol.replace('http', 'ws');
    this.url = i.toString();
    this.sock = new ReconnectingWebSocket(this.url, [], {
      maxReconnectionDelay: 10000,
      maxRetries: 100,
    });
    this.sock.onopen = () => {
      console.log('Connected');
      this.onopen?.(this.sock);
      this.interval = setInterval(() => this.sock.send('ping'), 30000);
    };
    this.sock.onclose = ({ code, reason }) => {
      console.warn('Connection closed, ', code, reason);
      if (code >= 4000) this.close();
      if (this.interval) clearInterval(this.interval);
      this.onclose?.(code, reason);
    };
    let decompress: Shorty = null;
    this.sock.onmessage = (message) => {
      if (message.data === 'pong') return;
      if (message.data === 'ping') {
        this.sock.send('pong');
        return;
      }
      if (message.data === 'shorty') {
        decompress = new Shorty();
        return;
      }
      if (process.env.NODE_ENV !== 'production') console.log('Sock.onmessage: ', message);
      let data = message.data;
      if (decompress) data = decompress.inflate(data);
      const msg = JSON.parse(data);
      if (msg.error === 'PermissionError' || msg.error === 'PrivilegeError') this.close();
      else this.onmessage?.(message, data);
    };
  }

  onmessage: (message: MessageEvent<any>, data: string) => void;
  onclose: (code: number, reason: string) => void;
  onopen: (sock: ReconnectingWebSocket) => void;

  on(event: 'message' | 'close' | 'open', callback: (...args: any[]) => void) {
    this[`on${event}`] = callback;
  }

  send(data) {
    this.sock.send(data);
  }

  close() {
    this.sock?.close?.();
  }
}
