/* axcStudios — Service Worker
   Da soporte PWA (instalación OPCIONAL como app) a las 2 apps del repo:
   index.html (sitio) y store.html (tienda). */
const CACHE = 'axcstudios-v7';
const CORE = [
  './',
  './index.html',
  './store.html',
  './player.html',
  './cuenta-demo.html',
  './manifest.webmanifest',
  './manifest-store.webmanifest',
  './axc-auth.js',
  './axc-ui.js',
  './axc-bg.js',
  './games-data.js',
  './images/logo.png',
  './images/icon-192.png',
  './images/icon-512.png',
  './images/icon-maskable-512.png',
  './images/store-icon-192.png',
  './images/store-icon-512.png',
  './images/store-icon-maskable-512.png',
  './images/games/warzone-ocean-siege.jpg',
  './images/games/rocket-ball.jpg',
  './images/games/lost-pizzeria-nw.jpg',
  './images/games/lost-pizzeria-mp.png',
  './images/games/kingdom-forgotten-seas.jpg',
  './images/games/velocitygp.jpg',
  './images/games/emergency-strike.jpg',
  './images/games/apex-kart.jpg',
  './images/games/zona-cero.png',
  './images/games/grand-theft-voxel.png'
];

self.addEventListener('install', (e) => {
  e.waitUntil((async () => {
    const cache = await caches.open(CACHE);
    await Promise.all(CORE.map(u => cache.add(u).catch(() => {})));
    await self.skipWaiting();
  })());
});

self.addEventListener('activate', (e) => {
  e.waitUntil((async () => {
    const keys = await caches.keys();
    await Promise.all(keys.filter(k => k !== CACHE).map(k => caches.delete(k)));
    await self.clients.claim();
  })());
});

/* Fetch: red-primero para código (HTML/JS/manifests → las actualizaciones llegan al instante),
   caché-primero para imágenes (portadas grandes). Fallback offline al caché. */
const RE_NET_FIRST = /\.(?:html|js|webmanifest|css)$/i;
self.addEventListener('fetch', (e) => {
  if (e.request.method !== 'GET') return;
  const url = new URL(e.request.url);
  if (url.origin !== location.origin) return; /* los juegos externos e iframes no se cachean */
  e.respondWith((async () => {
    const cached = await caches.match(e.request);
    const useNetFirst = RE_NET_FIRST.test(url.pathname) || url.pathname.endsWith('/') || url.pathname.endsWith('axcStudios/');
    if (!useNetFirst && cached) return cached;
    try {
      const res = await fetch(e.request);
      if (res && res.status === 200 && res.type === 'basic') {
        const clone = res.clone();
        caches.open(CACHE).then(c => c.put(e.request, clone));
      }
      return res;
    } catch (err) {
      if (cached) return cached;
      throw err;
    }
  })());
});
