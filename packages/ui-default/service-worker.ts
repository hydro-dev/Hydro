/// <reference no-default-lib="true"/>
/// <reference lib="ES2015" />
/// <reference types="@types/serviceworker" />
/* global clients */
/* eslint-disable no-restricted-globals */
import 'streamsaver/sw.js';

self.addEventListener('notificationclick', (event) => {
  console.log('On notification click: ', event.notification.tag);
  event.notification.close();
  if (!event.notification.tag.startsWith('message-')) return;
  event.waitUntil(clients.matchAll({ type: 'window' }).then((clientList) => {
    for (const client of clientList) {
      if (client.url === '/home/messages' && 'focus' in client) return client.focus();
    }
    if (clients.openWindow) clients.openWindow('/home/messages');
    return null;
  }));
});
