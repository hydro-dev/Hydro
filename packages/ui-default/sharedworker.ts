import ReconnectingWebsocket from 'reconnecting-websocket';

console.log('SharedWorker init');
const ports: MessagePort[] = [];
let conn: ReconnectingWebsocket;

function initSharedConn(path: string, sid: string) {
  if (conn) return;
  console.log('Init connection for', path);
  const url = new URL(path);
  url.protocol = url.protocol.replace('http', 'ws');
  url.searchParams.append('sid', sid);
  const sock = new ReconnectingWebsocket(url.toString());
  conn = sock;
  sock.onopen = () => console.log('Connected');
  sock.onerror = console.error;
  sock.onclose = (...args) => console.log('Closed', ...args);
  sock.onmessage = async (message) => {
    if (process.env.NODE_ENV !== 'production') console.log('SharedWorker.port.onmessage: ', message);
    const payload = JSON.parse(message.data);
    if (payload.event === 'auth') {
      if (['PermissionError', 'PrivilegeError'].includes(payload.error)) {
        conn?.close();
        conn = null;
      }
      return;
    }
    for (const port of ports) {
      port.postMessage({ type: 'message', payload: message.data });
      const success = await new Promise((resolve) => {
        const handle = (msg) => {
          if (['success', 'fail'].includes(msg.data.type)) {
            port.removeEventListener('message', handle);
            resolve(msg.data.type === 'success');
          }
        };
        port.addEventListener('message', handle);
      });
      if (success) return;
    }
    console.log('Failed to push notification');
    // TODO try system notification
  };
}

// @ts-ignore
onconnect = function (e) { // eslint-disable-line no-undef
  const port: MessagePort = e.ports[0];
  port.addEventListener('message', (msg) => {
    initSharedConn(msg.data.path, msg.data.cookie);
  });
  port.start();
  ports.push(port);
};
