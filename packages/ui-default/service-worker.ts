/// <reference no-default-lib="true"/>
/// <reference lib="ES2015" />
/// <reference types="@types/serviceworker" />
/* global clients */
/* eslint-disable no-restricted-globals */
import 'streamsaver/sw.js';

// TODO not working
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
const DO_NOT_PRECACHE = ['vditor', '.worker.js', 'fonts', 'i.monaco'];

function shouldCachePath(path: string) {
  if (!path.split('?')[0].split('/').pop()) return false;
  if (!path.split('?')[0].split('/').pop().includes('.')) return false;
  if (process.env.NODE_ENV !== 'production' && (path.includes('.hot-update.') || path.includes('?version='))) return false;
  return true;
}
function shouldCache(request: Request) {
  if (!shouldCachePath(request.url)) return false;
  // For files download, a response is formatted as string
  if (request.headers.get('Pragma') === 'no-cache') return false;
  return ['get', 'head', 'options'].includes(request.method.toLowerCase());
}
function shouldPreCache(name: string) {
  if (!shouldCachePath(name)) return false;
  if (DO_NOT_PRECACHE.filter((i) => name.includes(i)).length) return false;
  return true;
}

interface ServiceWorkerConfig {
  /** enabled hosts */
  hosts: string[];
  /** service domains */
  domains: string[];
  preload?: string;
}
let config: ServiceWorkerConfig = null;

async function initConfig() {
  const res = await fetch('/sw-config');
  config = await res.json();
  config.hosts ||= [];
  if (!config.domains?.length) config.domains = [location.host];
}

self.addEventListener('install', (event) => event.waitUntil((async () => {
  const [cache, manifest] = await Promise.all([
    caches.open(PRECACHE),
    fetch('/manifest.json').then((res) => res.json()),
    initConfig(),
  ]);
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
    const [names] = await Promise.all([
      caches.keys(),
      initConfig(),
    ]);
    console.log('Config: ', config);
    await Promise.all(names.filter((name) => !valid.includes(name)).map((p) => caches.delete(p)));
    self.clients.claim();
  })());
});

async function get(request: Request) {
  const isResource = shouldCache(request);
  for (const target of config.domains || []) {
    const source = new URL(request.url);
    source.host = target;
    try {
      console.log('From ', source.toString());
      const r = await fetch(source, {
        method: request.method,
        credentials: isResource ? 'same-origin' : 'include',
        headers: request.headers,
      });
      if (r.ok) {
        console.log('Load success from ', source.toString());
        return r;
      }
    } catch (error) {
      console.warn(source.toString(), ' Load fail ', error);
    }
  }
  return fetch(request);
}

async function cachedRespond(request: Request) {
  const cachedResponse = await caches.match(request.url);
  if (cachedResponse) return cachedResponse;
  console.log(`Caching ${request.url}`);
  const [cache, response] = await Promise.all([
    caches.open(PRECACHE),
    get(request),
  ]);
  if (response.ok) {
    cache.put(request.url, response.clone());
    return response;
  }
  return fetch(request);
}

self.addEventListener('fetch', (event: FetchEvent) => {
  if (!['get', 'post', 'head'].includes(event.request.method.toLowerCase())) return;
  if (!config) return; // Don't do anything when not initialized
  const url = new URL(event.request.url);
  const rewritable = config.domains.length > 1
    && config.domains.includes(url.hostname) && url.origin === location.origin;
  // Only handle whitelisted origins;
  if (!config.hosts.some((i) => event.request.url.startsWith(i))) return;

  if (shouldCache(event.request)) {
    event.respondWith((async () => {
      if (rewritable) {
        const targets = config.domains.map((i) => {
          const t = new URL(event.request.url);
          t.host = i;
          return t.toString();
        });
        const results = await Promise.all(targets.map((i) => caches.match(i)));
        if (results.find((i) => i)) return results.find((i) => i);
        return cachedRespond(event.request);
      }
      const cachedResponse = await caches.match(url);
      if (cachedResponse) return cachedResponse;
      console.log(`Caching ${event.request.url}`);
      const [cache, response] = await Promise.all([
        caches.open(PRECACHE),
        fetch(url, { headers: event.request.headers }), // Fetch from url to prevent opaque response
      ]);
      if (response.ok) {
        cache.put(url, response.clone());
        return response;
      }
      console.log(`Failed to cache ${event.request.url}`, response);
      // If response fails, re-fetch the original request to prevent
      // errors caused by different headers and do not cache them
      return fetch(event.request);
    })());
  } else if (rewritable) event.respondWith(get(event.request));
});
