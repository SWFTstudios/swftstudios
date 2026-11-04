/* SWFT Studios service worker: makes the site installable and usable offline.
 *
 * - Pages: network first. Public pages that load are kept so they open
 *   offline later; signed-in pages (/portal/, /admin/, /account.html) and
 *   /api/ are never stored.
 * - Fonts and images: cache first (their URLs rarely change).
 * - CSS and JS: network first (they carry ?v= versions), cache as fallback.
 * - Offline with nothing cached: /offline.html.
 * Bump VERSION to drop every old cache.
 */
const VERSION = "swft-20261105-r2";
const OFFLINE_URL = "/offline.html";
const PRECACHE = [OFFLINE_URL, "/images/app/icon-192.png", "/css/swft-fonts.css?v=20261027-mono"];
const PRIVATE = /^\/(api|admin|portal)\/|^\/account\.html/;

self.addEventListener("install", (event) => {
  event.waitUntil(caches.open(VERSION).then((c) => c.addAll(PRECACHE)).then(() => self.skipWaiting()));
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches.keys()
      .then((keys) => Promise.all(keys.filter((k) => k !== VERSION).map((k) => caches.delete(k))))
      .then(() => self.clients.claim())
  );
});

async function networkFirst(request, store) {
  try {
    const res = await fetch(request);
    if (store && res.ok && res.type === "basic") {
      const copy = res.clone();
      caches.open(VERSION).then((c) => c.put(request, copy));
    }
    return res;
  } catch (err) {
    const hit = await caches.match(request);
    if (hit) return hit;
    if (request.mode === "navigate") return caches.match(OFFLINE_URL);
    throw err;
  }
}

async function cacheFirst(request) {
  const hit = await caches.match(request);
  if (hit) return hit;
  const res = await fetch(request);
  if (res.ok && res.type === "basic") {
    const copy = res.clone();
    caches.open(VERSION).then((c) => c.put(request, copy));
  }
  return res;
}

self.addEventListener("fetch", (event) => {
  const { request } = event;
  if (request.method !== "GET") return;
  const url = new URL(request.url);
  if (url.origin !== self.location.origin) return;
  if (PRIVATE.test(url.pathname)) {
    // Never stored. Offline navigations still get the offline page.
    if (request.mode === "navigate") event.respondWith(fetch(request).catch(() => caches.match(OFFLINE_URL)));
    return;
  }
  if (request.mode === "navigate") { event.respondWith(networkFirst(request, true)); return; }
  if (/^\/(fonts|images)\//.test(url.pathname)) { event.respondWith(cacheFirst(request)); return; }
  if (/^\/(css|js|data)\//.test(url.pathname)) { event.respondWith(networkFirst(request, true)); return; }
});
