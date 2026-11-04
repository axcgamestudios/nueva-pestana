/* axcGames — Service Worker (instalación OPCIONAL como app)
   Copiado del diseño axcStudios, adaptado al export estático de Next.js:
   - HTML: network-first (nunca sirve una versión vieja de la página)
   - Assets propios (img/fuentes/wasm): cache-first con actualización en segundo plano
*/
const CACHE = "axcgames-design-v1";
const CORE = ["./", "./manifest.webmanifest", "./axc/logo.webp", "./axc/icon-192.png", "./axc/icon-512.png"];

self.addEventListener("install", (e) => {
  e.waitUntil(
    caches.open(CACHE).then((c) => c.addAll(CORE).catch(() => undefined)).then(() => self.skipWaiting())
  );
});

self.addEventListener("activate", (e) => {
  e.waitUntil(
    caches
      .keys()
      .then((keys) => Promise.all(keys.filter((k) => k !== CACHE).map((k) => caches.delete(k))))
      .then(() => self.clients.claim())
  );
});

self.addEventListener("fetch", (e) => {
  const req = e.request;
  if (req.method !== "GET") return;
  const url = new URL(req.url);
  if (url.origin !== self.location.origin) return; // juegos y APIs: directos

  if (req.mode === "navigate") {
    // network-first para la página
    e.respondWith(
      fetch(req)
        .then((res) => {
          const copy = res.clone();
          caches.open(CACHE).then((c) => c.put(req, copy)).catch(() => undefined);
          return res;
        })
        .catch(() => caches.match(req).then((m) => m || caches.match("./")))
    );
    return;
  }

  // resto de assets propios: cache-first
  e.respondWith(
    caches.match(req).then((hit) => {
      if (hit) {
        // refrescar en segundo plano
        fetch(req)
          .then((res) => { if (res.ok) caches.open(CACHE).then((c) => c.put(req, res)); })
          .catch(() => undefined);
        return hit;
      }
      return fetch(req).then((res) => {
        if (res.ok && res.type === "basic") {
          const copy = res.clone();
          caches.open(CACHE).then((c) => c.put(req, copy)).catch(() => undefined);
        }
        return res;
      });
    })
  );
});
