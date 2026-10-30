// TarotNice offline cache. Precache the app shell + fonts + mascot;
// serve static assets cache-first, pages network-first with fallback.
const CACHE = "tarotnice-v57";

const CORE = [
  "/",
  "/terms",
  "/privacy",
  "/contact",
  "/cards",
  "/app/site.css",
  "/app/sync-queue.js",
  "/app/history.js",
  "/app/progress.js",
  "/app/billing.js",
  "/mascot/ngern-head-mark.svg",
  "/mascot/ngern-sitting.svg",
  "/mascot/ngern-sleeping.svg",
  "/manifest.json",
  "/fonts/cormorant-garamond-latin-500.woff2",
  "/fonts/cormorant-garamond-latin-600.woff2",
  "/fonts/cormorant-garamond-latin-italic-500.woff2",
  "/fonts/ibm-plex-sans-thai-latin-400.woff2",
  "/fonts/ibm-plex-sans-thai-latin-500.woff2",
  "/fonts/ibm-plex-sans-thai-thai-400.woff2",
  "/fonts/ibm-plex-sans-thai-thai-500.woff2",
];

self.addEventListener("install", (event) => {
  event.waitUntil(
    caches.open(CACHE).then((cache) => cache.addAll(CORE)).then(() => self.skipWaiting()).catch(() => {}),
  );
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches.keys().then((keys) => Promise.all(keys.filter((k) => k !== CACHE).map((k) => caches.delete(k)))).then(() => self.clients.claim()),
  );
});

self.addEventListener("fetch", (event) => {
  const url = new URL(event.request.url);
  if (event.request.method !== "GET" || url.origin !== location.origin) return;
  // API + SSE streams: never intercept. Quota, readings, and history
  // are per-user and per-day; letting them fall into the cache-first
  // tail below served yesterday's /api/me/summary after a normal
  // refresh (only a hard refresh bypasses the worker), so the quota
  // row showed stale counts day after day.
  if (url.pathname.startsWith("/api/")) return;
  // Card art + share images: cache-first (immutable, versioned).
  if (url.pathname.startsWith("/static/")) {
    event.respondWith(
      caches.open(CACHE).then(async (cache) => {
        const hit = await cache.match(event.request);
        if (hit) return hit;
        const res = await fetch(event.request);
        if (res.ok) cache.put(event.request, res.clone());
        return res;
      }),
    );
    return;
  }
  // Pages: network-first, cache fallback.
  if (event.request.mode === "navigate") {
    event.respondWith(
      fetch(event.request)
        .then((res) => {
          const copy = res.clone();
          caches.open(CACHE).then((cache) => cache.put(event.request, copy)).catch(() => {});
          return res;
        })
        .catch(() => caches.match(event.request).then((hit) => hit || caches.match("/"))),
    );
    return;
  }
  // App shell assets: cache-first.
  event.respondWith(
    caches.match(event.request).then(
      (hit) =>
        hit ||
        fetch(event.request).then((res) => {
          const copy = res.clone();
          caches.open(CACHE).then((cache) => cache.put(event.request, copy)).catch(() => {});
          return res;
        }),
    ),
  );
});
