import ReconnectingWebsocket from 'reconnecting-websocket';

console.log('SharedWorker init');

const sharedConnections: Record<string, [ReconnectingWebsocket, MessagePort[]]> = {};
interface RequestInitSharedConnPayload {
  type: 'sharedConn';
  cookie: any;
  path: string;
}
interface RequestSendMessagePayload {
  type: 'message';
  path: string;
  payload: string;
}
type RequestPayload = RequestInitSharedConnPayload | RequestSendMessagePayload;

function broadcastMsg(ports: MessagePort[], message: any) {
  for (const p of ports) p.postMessage(message);
}
function closeSharedConn(path: string) {
  sharedConnections[path][0].close();
  delete sharedConnections[path];
}
function initSharedConn(path: string, port: MessagePort, cookie: any) {
  if (!sharedConnections[path]) {
    console.log('Init connection for', path);
    const sock = new ReconnectingWebsocket(path);
    const ports: MessagePort[] = [];
    sharedConnections[path] = [sock, ports];

    sock.onopen = () => sock.send(cookie);
    sock.onmessage = (message) => {
      if (process.env.NODE_ENV !== 'production') console.log('SharedWorker.port.onmessage: ', message);
      const payload = JSON.parse(message.data);
      if (payload.event === 'auth') {
        if (['PermissionError', 'PrivilegeError'].includes(payload.error)) {
          broadcastMsg(ports, { type: 'close', path, error: payload.error });
          closeSharedConn(path);
        } else {
          console.log('Connected to', path);
          broadcastMsg(ports, { type: 'open', path });
        }
      } else broadcastMsg(ports, { type: 'message', path, payload: message.data });
    };
    sock.onerror = () => broadcastMsg(ports, { type: 'error', path });
    sock.onclose = (ev) => broadcastMsg(ports, { type: 'close', path, error: ev.reason });
  }

  sharedConnections[path][1].push(port);
}

// @ts-ignore
onconnect = function (e) { // eslint-disable-line no-undef
  const port: MessagePort = e.ports[0];

  port.addEventListener('message', (msg: { data: RequestPayload }) => {
    if (msg.data.type === 'sharedConn') initSharedConn(msg.data.path, port, msg.data.cookie);
    if (msg.data.type === 'message') sharedConnections[msg.data.path]?.[0].send(msg.data.payload);
  });

  port.start();
};
