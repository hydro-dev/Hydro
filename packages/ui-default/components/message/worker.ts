/// <reference no-default-lib="true" />
/// <reference lib="webworker" />
import ReconnectingWebsocket from 'reconnecting-websocket';
import { FLAG_INFO } from 'vj/constant/message';
declare const self: SharedWorkerGlobalScope;

console.log('SharedWorker init');

let conn: ReconnectingWebsocket;
let lcookie: string;
const ports: Set<MessagePort> = new Set();
interface RequestInitSharedConnPayload {
  type: 'conn';
  cookie: string;
  path: string;
}
interface RequestAckPayload {
  type: 'ack';
  id: string;
}
interface RequestUnloadPayload {
  type: 'unload';
}
type RequestPayload = RequestInitSharedConnPayload | RequestAckPayload | RequestUnloadPayload;
const ack = {};

function broadcastMsg(message: any) {
  for (const p of ports) p.postMessage(message);
}

function onMessage(payload: any) {
  broadcastMsg({ type: 'message', payload });
  let acked = false;
  ack[payload.mdoc._id] = () => { acked = true; };
  setTimeout(() => {
    delete ack[payload.mdoc._id];
    if (acked) return;
    if (payload.mdoc.flag & FLAG_INFO) return;
    if (Notification?.permission !== 'granted') {
      console.log('Notification permission denied');
      return;
    }
    // eslint-disable-next-line no-new
    new Notification(
      payload.udoc.uname || 'Hydro Notification',
      {
        tag: `message-${payload.mdoc._id}`,
        icon: payload.udoc.avatarUrl || '/android-chrome-192x192.png',
        body: payload.mdoc.content,
      },
    );
  }, 5000);
}

function initConn(path: string, port: MessagePort, cookie: any) {
  ports.add(port);
  console.log('Init connection');
  lcookie = cookie.split('sid=')[1].split(';')[0];
  if (conn) return;
  const url = new URL(path, location.origin);
  conn = new ReconnectingWebsocket(url.toString().replace('http', 'ws'));
  conn.onopen = () => {
    console.log('Connected');
    broadcastMsg({ type: 'open' });
    conn.send(JSON.stringify({
      operation: 'subscribe',
      request_id: Math.random().toString(16).substring(2),
      credential: lcookie,
      channels: ['message'],
    }));
  };
  conn.onerror = () => broadcastMsg({ type: 'error' });
  conn.onclose = (ev) => broadcastMsg({ type: 'close', error: ev.reason });
  conn.onmessage = (message) => {
    if (process.env.NODE_ENV !== 'production') console.log('SharedWorker.port.onmessage: ', message);
    if (message.data === 'ping') {
      conn.send('pong');
      return;
    }
    const payload = JSON.parse(message.data);
    if (['PermissionError', 'PrivilegeError'].includes(payload.error)) {
      broadcastMsg({ type: 'close', error: payload.error });
      conn.close();
    } else if (payload.operation === 'event') {
      onMessage(payload.payload);
    }
  };
}

self.onconnect = function (e) {
  const port = e.ports[0];

  port.addEventListener('message', (msg: { data: RequestPayload }) => {
    if (msg.data.type === 'conn') initConn(msg.data.path, port, msg.data.cookie);
    if (msg.data.type === 'ack') ack[msg.data.id]?.();
    if (msg.data.type === 'unload') ports.delete(port);
  });

  port.start();
};
