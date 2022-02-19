const base = 'https://hydro.ac';
const target = [
  'https://hydro.ac',
  'https://us.hydro.ac',
  'https://proxy1.hydro.workers.dev',
];

this.addEventListener('install', () => {
  console.log('Service Worker installing');
});
async function get(url) {
  let current = 0;
  let response;
  while (target[current]) {
    response = fetch(url.replace(base, target[current]));
    try {
      await response;
      if (current) console.log('From ', target[current]);
      return response;
    } catch (error) {
      console.warn(target[current], ' Load fail ', error);
      current++;
    }
  }
  return response;
}
this.addEventListener('fetch', (event) => {
  // eslint-disable-next-line no-restricted-globals
  if (new URL(event.request.url).origin !== location.origin) return;
  event.respondWith(get(event.request.url));
});
