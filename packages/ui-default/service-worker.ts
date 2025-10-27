/// <reference no-default-lib="true" />
/// <reference lib="webworker" />
export { }; // make it a module so that declare self works
declare const self: ServiceWorkerGlobalScope;

const map = new Map();

function createStream(port) {
  return new ReadableStream({
    start(controller) {
      port.onmessage = ({ data }) => {
        if (data === 'end') return controller.close();
        if (data === 'abort') return controller.error('Aborted the download');
        return controller.enqueue(data);
      };
    },
    cancel(reason) {
      console.log('user aborted', reason);
      port.postMessage({ abort: true });
    },
  });
}

self.onmessage = (event) => {
  if (event.data === 'ping') return;
  const data = event.data;
  const downloadUrl = data.url || `${self.registration.scope + Math.random()}/${typeof data === 'string' ? data : data.filename}`;
  const port = event.ports[0];
  const metadata = Array.from({ length: 3 }); // [stream, data, port]
  metadata[1] = data;
  metadata[2] = port;
  if (event.data.readableStream) {
    metadata[0] = event.data.readableStream;
  } else if (event.data.transferringReadable) {
    port.onmessage = (evt) => {
      port.onmessage = null;
      metadata[0] = evt.data.readableStream;
    };
  } else metadata[0] = createStream(port);
  map.set(downloadUrl, metadata);
  port.postMessage({ download: downloadUrl });
};

function streamsaver(event: FetchEvent) {
  const hijacke = map.get(event.request.url);
  const [stream, data, port] = hijacke;
  map.delete(event.request.url);
  const responseHeaders = new Headers({
    'Content-Type': 'application/octet-stream; charset=utf-8',
    'Content-Security-Policy': "default-src 'none'",
    'X-Content-Security-Policy': "default-src 'none'",
    'X-WebKit-CSP': "default-src 'none'",
    'X-XSS-Protection': '1; mode=block',
  });
  const headers = new Headers(data.headers || {});
  if (headers.has('Content-Length')) {
    responseHeaders.set('Content-Length', headers.get('Content-Length'));
  }
  if (headers.has('Content-Disposition')) {
    responseHeaders.set('Content-Disposition', headers.get('Content-Disposition'));
  }
  if (data.size) {
    console.warn('Depricated');
    responseHeaders.set('Content-Length', data.size);
  }
  let fileName = typeof data === 'string' ? data : data.filename;
  if (fileName) {
    console.warn('Depricated');
    fileName = encodeURIComponent(fileName).replace(/['()]/g, escape).replace(/\*/g, '%2A');
    responseHeaders.set('Content-Disposition', `attachment; filename*=UTF-8''${fileName}`);
  }
  event.respondWith(new Response(stream, { headers: responseHeaders }));
  port.postMessage({ debug: 'Download started' });
}

// TODO not working
self.addEventListener('notificationclick', (event) => {
  console.log('On notification click: ', event.notification.tag);
  event.notification.close();
  if (!event.notification.tag.startsWith('message-')) return;
  event.waitUntil(self.clients.matchAll({ type: 'window' }).then((clientList) => {
    for (const client of clientList) {
      if (client.url === '/home/messages' && 'focus' in client) return client.focus();
    }
    if (self.clients.openWindow) self.clients.openWindow('/home/messages');
    return null;
  }));
});

const PRECACHE = 'ui-resources-cache';
const DO_NOT_PRECACHE = ['.worker.js', 'fonts'];

function shouldCachePath(path: string) {
  if (!path.split('?')[0].split('/').pop()) return false;
  if (!path.split('?')[0].split('/').pop().includes('.')) return false;
  if (process.env.NODE_ENV !== 'production' && (path.includes('.hot-update.') || path.includes('?version='))) return false;
  if (path.includes('?v=')) return false;
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
  /** assets domains */
  assets: string[];
  preload?: string;
}
let config: ServiceWorkerConfig = null;

function initConfig(cfg) {
  config = cfg;
  config.hosts ||= [];
  config.domains = Array.from(new Set([location.host, ...(config.domains || [])]));
  console.log('Config:', config);
}

self.addEventListener('install', (event) => event.waitUntil((async () => {
  if (process.env.NODE_ENV === 'production' && config?.preload) {
    const [cache, manifest] = await Promise.all([
      caches.open(PRECACHE),
      fetch('/manifest.json').then((res) => res.json()),
    ]);
    const files = Object.values(manifest).filter(shouldPreCache)
      .map((i: string) => new URL(i, config.preload).toString());
    await cache.addAll(files); // NOTE: CORS header
  }
  self.skipWaiting();
})()));

self.addEventListener('activate', (event) => {
  event.waitUntil(self.clients.claim());
  const valid = [PRECACHE];
  caches.keys().then((names) => names
    .filter((name) => name.startsWith('precache-'))
    .filter((name) => !valid.includes(name))
    .map((p) => caches.delete(p)));
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
        redirect: request.redirect,
        keepalive: request.keepalive,
        referrer: request.referrer,
        referrerPolicy: request.referrerPolicy,
        signal: request.signal,
        ...(request.method.toLowerCase() === 'get' ? {} : { body: request.body }),
      });
      if (r.ok) {
        console.log('Load success from ', source.toString());
        return r;
      }
    } catch (error) {
      console.warn(source.toString(), ' Load fail ', error);
    }
  }
  return null;
}

function transformUrl(url: string) {
  const urlObject = new URL(url);
  const path = urlObject.pathname;
  if (path.startsWith('/fs/') || path.toLowerCase().includes('x-amz')) urlObject.search = '';
  return urlObject.toString();
}

async function cached(request: Request, cacheKey: string, fetchFunc: () => Promise<Response | null>) {
  const url = transformUrl(request.url);
  const urlObject = new URL(url);
  const isAsset = config.assets.some((i) => request.url.startsWith(i));
  const rewritable = !isAsset && config.domains.length > 1
    && config.domains.includes(urlObject.hostname)
    && urlObject.origin === location.origin;
  let targets = [url];
  if (rewritable) {
    targets = config.domains.map((i) => {
      const t = new URL(request.url);
      t.host = i;
      return transformUrl(t.toString());
    });
  }

  if (!shouldCache(request)) return rewritable ? fetchFunc() : fetch(request);

  const results = await Promise.all(targets.map((i) => caches.match(i)));
  const found = results.find((i) => i);
  if (found) {
    console.debug('Serve from cache %s <- %s', request.url, found.url);
    return found;
  }
  const [cache, response] = await Promise.all([
    caches.open(cacheKey),
    fetchFunc().catch(() => null),
  ]);
  if (response?.status === 206) return response; // partial response cannot be cached
  if (response?.ok) {
    console.log(`Cached ${url}`);
    cache.put(url, response.clone());
    return response;
  }
  console.log(`Failed to cache ${url}`, response);
  // If response fails, re-fetch the original request to prevent
  // errors caused by different headers and do not cache them
  return fetch(request);
}

self.addEventListener('fetch', (event: FetchEvent) => {
  if (event.request.url.endsWith('/ping')) {
    event.respondWith(new Response('pong'));
    return;
  }
  if (event.request.url.endsWith('/service-worker-config')) {
    event.request.json().then((cfg) => initConfig(cfg));
    event.respondWith(new Response('ok'));
    return;
  }
  if (map.get(event.request.url)) {
    streamsaver(event);
    return;
  }
  if (!['get', 'post', 'head'].includes(event.request.method.toLowerCase())) return;
  if (!config) return; // Don't do anything when not initialized
  const url = new URL(event.request.url);
  const isAsset = config.assets.some((i) => event.request.url.startsWith(i));
  const rewritable = !isAsset && config.domains.length > 1
    && config.domains.includes(url.hostname)
    && url.origin === location.origin;
  // Only handle whitelisted origins;
  if (!isAsset && !config.hosts.some((i) => event.request.url.startsWith(i))) return;
  // Do not cache range requests
  if (event.request.headers.get('range')?.trim()?.length) return;

  event.respondWith((async () => cached(event.request, isAsset ? 'assets' : PRECACHE, () => (rewritable
    ? get(event.request)
    : fetch(url, {
      method: event.request.method,
      headers: event.request.headers,
      redirect: event.request.redirect,
      keepalive: event.request.keepalive,
      referrer: event.request.referrer,
      referrerPolicy: event.request.referrerPolicy,
      signal: event.request.signal,
    }))))());
});
