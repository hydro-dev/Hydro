/* eslint-disable no-restricted-globals */
/// <reference types="@types/sharedworker" />
import ReconnectingWebsocket from 'reconnecting-websocket';

console.log('SharedWorker init');

let conn: ReconnectingWebsocket;
let lcookie: string;
const ports: MessagePort[] = [];
interface RequestInitSharedConnPayload {
  type: 'conn';
  cookie: string;
  path: string;
}
interface RequestAckPayload {
  type: 'ack';
  id: string;
}
type RequestPayload = RequestInitSharedConnPayload | RequestAckPayload;
const ack = {};

function broadcastMsg(message: any) {
  for (const p of ports) p.postMessage(message);
}
function initConn(path: string, port: MessagePort, cookie: any) {
  if (cookie !== lcookie) conn?.close();
  else if (conn && conn.readyState === conn.OPEN) return;
  lcookie = cookie;
  console.log('Init connection for', path);
  conn = new ReconnectingWebsocket(path);
  ports.push(port);
  conn.onopen = () => conn.send(cookie);
  conn.onerror = () => broadcastMsg({ type: 'error' });
  conn.onclose = (ev) => broadcastMsg({ type: 'close', error: ev.reason });
  conn.onmessage = (message) => {
    if (process.env.NODE_ENV !== 'production') console.log('SharedWorker.port.onmessage: ', message);
    const payload = JSON.parse(message.data);
    if (payload.event === 'auth') {
      if (['PermissionError', 'PrivilegeError'].includes(payload.error)) {
        broadcastMsg({ type: 'close', error: payload.error });
        conn.close();
      } else {
        console.log('Connected to', path);
        broadcastMsg({ type: 'open' });
      }
    } else {
      broadcastMsg({ type: 'message', payload });
      let acked = false;
      ack[payload.mdoc.id] = () => { acked = true; };
      setTimeout(() => {
        delete ack[payload.mdoc.id];
        if (acked) return;
        if (Notification?.permission !== 'granted') {
          console.log('Notification permission denied');
          return;
        }
        const notification = new Notification(
          payload.udoc.uname || 'Hydro Notification',
          {
            icon: payload.udoc.avatarUrl || '/android-chrome-192x192.png',
            body: payload.mdoc.content,
          },
        );
        notification.onclick = () => window.open('/home/messages');
      }, 5000);
    }
  };
}

// eslint-disable-next-line no-undef
onconnect = function (e) {
  const port = e.ports[0];

  port.addEventListener('message', (msg: { data: RequestPayload }) => {
    if (msg.data.type === 'conn') initConn(msg.data.path, port, msg.data.cookie);
    if (msg.data.type === 'ack') ack[msg.data.id]();
  });

  port.start();
};
