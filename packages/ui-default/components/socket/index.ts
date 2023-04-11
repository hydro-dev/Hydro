import ReconnectingWebSocket from 'reconnecting-websocket';

export default class Sock {
  sock: ReconnectingWebSocket;
  interval: NodeJS.Timer;

  constructor(public url: string, nocookie = false) {
    const i = new URL(url, window.location.href);
    if (i.host !== window.location.host && !nocookie) i.searchParams.append('sid', document.cookie.split('sid=')[1].split(';')[0]);
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
    this.sock.onmessage = (message) => {
      if (message.data === 'pong') return;
      if (message.data === 'ping') {
        this.sock.send('pong');
        return;
      }
      if (process.env.NODE_ENV !== 'production') console.log('Sock.onmessage: ', message);
      const msg = JSON.parse(message.data);
      if (msg.error === 'PermissionError' || msg.error === 'PrivilegeError') this.close();
      else this.onmessage?.(message);
    };
  }

  onmessage: (message: MessageEvent<any>) => void;
  onclose: (code: number, reason: string) => void;
  onopen: (sock: ReconnectingWebSocket) => void;

  send(data) {
    this.sock.send(data);
  }

  close() {
    this.sock?.close?.();
  }
}
