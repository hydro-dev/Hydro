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

const PRECACHE = `precache-${process.env.VERSION}`;

function shouldCache(name: string) {
  if (!name.split('/').pop()) return false;
  if (!name.split('/').pop().includes('.')) return false;
  return true;
}
function shouldPreCache(name: string) {
  if (!shouldCache(name)) return false;
  if (['vditor', '.worker.js', 'fonts', 'i.monaco'].filter((i) => name.includes(i))) return false;
  return true;
}

interface ServiceWorkerConfig {
  base?: string;
  targets?: string[];
  preload?: boolean;
}
const config: ServiceWorkerConfig = null;

self.addEventListener('install', (event) => {
  event.waitUntil(
    Promise.all([
      caches.open(PRECACHE),
      fetch('/manifest.json').then((res) => res.json()),
    ]).then(([cache, manifest]) => {
      if (process.env.NODE_ENV !== 'production' || !config?.preload) return;
      // TODO fetch cache from different origin
      cache.addAll(Object.values(manifest).filter(shouldPreCache) as string[]);
    }).then(() => self.skipWaiting()),
  );
});

self.addEventListener('activate', (event) => {
  const currentCaches = [PRECACHE];
  event.waitUntil(
    caches.keys()
      .then((cacheNames) => cacheNames.filter((cacheName) => !currentCaches.includes(cacheName)))
      .then((cachesToDelete) => Promise.all(cachesToDelete.map((cacheToDelete) => caches.delete(cacheToDelete))))
      .then(() => self.clients.claim()),
  );
});

async function get(url: string) {
  let current = 0;
  let response: Promise<Response>;
  while (config.targets[current]) {
    const source = config.targets[current];
    response = fetch(url.replace(config.base, source));
    try {
      await response;
      if (current) console.log('From ', source);
      return response;
    } catch (error) {
      console.warn(source, ' Load fail ', error);
      current++;
    }
  }
  return response;
}

self.addEventListener('fetch', (event: FetchEvent) => {
  if (!['get', 'head'].includes(event.request.method.toLowerCase())) return;
  if (!shouldCache(event.request.url) && config?.base && config?.targets?.length) {
    if (new URL(event.request.url).origin !== location.origin) return;
    event.respondWith(get(event.request.url));
  }
  event.respondWith(
    caches.match(event.request).then((cachedResponse) => {
      if (cachedResponse) return cachedResponse;
      if (process.env.NODE_ENV !== 'production') return fetch(event.request);
      console.log(`Caching ${event.request.url}`);
      return caches.open(PRECACHE)
        .then((cache) => fetch(event.request)
          .then((response) => cache.put(event.request, response.clone())
            .then(() => response)));
    }),
  );
});
