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
const DO_NOT_CACHE = ['vditor', '.worker.js', 'fonts', 'i.monaco'];

function shouldCache(name: string) {
  if (!name.split('/').pop()) return false;
  if (!name.split('/').pop().includes('.')) return false;
  return true;
}
function shouldPreCache(name: string) {
  if (!shouldCache(name)) return false;
  if (DO_NOT_CACHE.filter((i) => name.includes(i)).length) return false;
  return true;
}

interface ServiceWorkerConfig {
  base?: string;
  hosts?: string[];
  targets?: string[];
  preload?: string;
}
let config: ServiceWorkerConfig = null;

async function get(url: string) {
  const pending = [url, ...(config?.targets || []).map((i) => url.replace(config.base, i))];
  let response: Promise<Response>;
  for (const source of pending) {
    response = fetch(source);
    try {
      console.log('From ', source);
      const r = await response;
      if (r.ok) return r;
    } catch (error) {
      console.warn(source, ' Load fail ', error);
    }
  }
  return response;
}

self.addEventListener('install', (event) => event.waitUntil((async () => {
  const [cache, manifest, cfg] = await Promise.all([
    caches.open(PRECACHE),
    fetch('/manifest.json').then((res) => res.json()),
    fetch('/sw-config').then((res) => res.json()),
  ]);
  config = cfg;
  if (process.env.NODE_ENV === 'production' && config?.preload) {
    const files = Object.values(manifest).filter(shouldPreCache)
      .map((i: string) => new URL(i, config.preload).toString());
    await cache.addAll(files); // NOTE: CORS header
  }
  self.skipWaiting();
})()));

self.addEventListener('activate', (event) => {
  const valid = [PRECACHE];
  event.waitUntil((async () => {
    const [names, cfg] = await Promise.all([
      caches.keys(),
      fetch('/sw-config').then((res) => res.json()),
    ]);
    config = cfg;
    await Promise.all(names.filter((name) => !valid.includes(name)).map((p) => caches.delete(p)));
    self.clients.claim();
  })());
});

self.addEventListener('fetch', (event: FetchEvent) => {
  if (!['get', 'head'].includes(event.request.method.toLowerCase())) return;
  if (!shouldCache(event.request.url) && config?.base && config?.targets?.length) {
    if (new URL(event.request.url).origin !== location.origin) return;
    event.respondWith(get(event.request.url));
    return;
  }
  // Only handle whitelisted origins;
  if (!config?.hosts?.some((i) => event.request.url.startsWith(i))) return;
  if (process.env.NODE_ENV !== 'production' || !shouldCache(event.request.url)) return;
  event.respondWith((async () => {
    const cachedResponse = await caches.match(event.request.url);
    if (cachedResponse) return cachedResponse;
    console.log(`Caching ${event.request.url}`);
    const [cache, response] = await Promise.all([
      caches.open(PRECACHE),
      fetch(event.request.url), // Fetch from url to prevent opaque response
    ]);
    if (response.ok) {
      cache.put(event.request.url, response.clone());
      return response;
    }
    // If response fails, re-fetch the original request to prevent
    // errors caused by different headers and do not cache them
    return fetch(event.request);
  })());
});
