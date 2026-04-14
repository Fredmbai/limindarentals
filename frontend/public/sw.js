// LumindaRentals Service Worker
// Bump CACHE_VERSION on every production deploy to invalidate old caches.
const CACHE_VERSION = "v1";

const CACHE_STATIC = `lr-static-${CACHE_VERSION}`;  // /_next/static/* (immutable)
const CACHE_FONTS  = `lr-fonts-${CACHE_VERSION}`;   // Google Fonts
const CACHE_API    = `lr-api-${CACHE_VERSION}`;     // /api/* responses
const CACHE_PAGES  = `lr-pages-${CACHE_VERSION}`;   // HTML pages

const ALL_CACHES = [CACHE_STATIC, CACHE_FONTS, CACHE_API, CACHE_PAGES];

const OFFLINE_URL = "/offline";

// ─── Install ────────────────────────────────────────────────────────────────
// Pre-cache only the offline fallback page. Everything else is cached on demand.
self.addEventListener("install", (event) => {
  event.waitUntil(
    caches.open(CACHE_PAGES).then((cache) => cache.add(OFFLINE_URL))
  );
  self.skipWaiting();
});

// ─── Activate ───────────────────────────────────────────────────────────────
// Delete any caches that belong to an older version.
self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches.keys().then((keys) =>
      Promise.all(
        keys
          .filter((k) => k.startsWith("nr-") && !ALL_CACHES.includes(k))
          .map((k) => caches.delete(k))
      )
    )
  );
  self.clients.claim();
});

// ─── Fetch ──────────────────────────────────────────────────────────────────
self.addEventListener("fetch", (event) => {
  const { request } = event;
  const url = new URL(request.url);

  // Only handle GET requests
  if (request.method !== "GET") return;

  // ── Google Fonts CSS (stale-while-revalidate: always fresh but fast) ──
  if (url.hostname === "fonts.googleapis.com") {
    event.respondWith(staleWhileRevalidate(request, CACHE_FONTS));
    return;
  }

  // ── Google font files (cache-first: font binaries never change) ──
  if (url.hostname === "fonts.gstatic.com") {
    event.respondWith(cacheFirst(request, CACHE_FONTS));
    return;
  }

  // Skip all other cross-origin requests
  if (url.origin !== self.location.origin) return;

  // ── Next.js static bundles (cache-first: content-hashed, immutable) ──
  if (url.pathname.startsWith("/_next/static/")) {
    event.respondWith(cacheFirst(request, CACHE_STATIC));
    return;
  }

  // ── API calls (network-first: always try fresh, fall back to cache) ──
  if (url.pathname.startsWith("/api/")) {
    event.respondWith(networkFirst(request, CACHE_API));
    return;
  }

  // ── Page navigations (network-first + offline fallback) ──
  if (request.mode === "navigate") {
    event.respondWith(networkFirstWithOfflineFallback(request));
    return;
  }

  // ── Everything else: icons, manifests, public files ──
  event.respondWith(staleWhileRevalidate(request, CACHE_PAGES));
});

// ─── Push Notifications ─────────────────────────────────────────────────────
self.addEventListener("push", (event) => {
  const data = event.data?.json() ?? {};
  event.waitUntil(
    self.registration.showNotification(data.title || "LumindaRentals", {
      body:    data.body    || "",
      icon:    "/icons/icon.svg",
      badge:   "/icons/icon.svg",
      tag:     data.tag     || "default",
      renotify: true,
      data:    { url: data.url || "/" },
    })
  );
});

self.addEventListener("notificationclick", (event) => {
  event.notification.close();
  const target = event.notification.data?.url || "/";
  event.waitUntil(
    clients.matchAll({ type: "window", includeUncontrolled: true }).then((list) => {
      for (const client of list) {
        if (client.url === target && "focus" in client) return client.focus();
      }
      return clients.openWindow(target);
    })
  );
});

// ─── Strategies ─────────────────────────────────────────────────────────────

/** Serve from cache immediately; update cache in background. */
async function staleWhileRevalidate(request, cacheName) {
  const cache  = await caches.open(cacheName);
  const cached = await cache.match(request);
  const fetchPromise = fetch(request)
    .then((response) => {
      if (response.ok) cache.put(request, response.clone());
      return response;
    })
    .catch(() => cached);
  return cached || fetchPromise;
}

/** Serve from cache if available; otherwise fetch and cache. */
async function cacheFirst(request, cacheName) {
  const cached = await caches.match(request);
  if (cached) return cached;
  const response = await fetch(request);
  if (response.ok) {
    const cache = await caches.open(cacheName);
    cache.put(request, response.clone());
  }
  return response;
}

/** Always try the network first; fall back to cache on failure. */
async function networkFirst(request, cacheName) {
  try {
    const response = await fetch(request);
    if (response.ok) {
      const cache = await caches.open(cacheName);
      cache.put(request, response.clone());
    }
    return response;
  } catch {
    const cached = await caches.match(request);
    return (
      cached ||
      new Response(JSON.stringify({ detail: "You are offline." }), {
        status: 503,
        headers: { "Content-Type": "application/json" },
      })
    );
  }
}

/** Network first for pages; show /offline on failure. */
async function networkFirstWithOfflineFallback(request) {
  try {
    const response = await fetch(request);
    if (response.ok) {
      const cache = await caches.open(CACHE_PAGES);
      cache.put(request, response.clone());
    }
    return response;
  } catch {
    const cached = await caches.match(request);
    return cached || caches.match(OFFLINE_URL);
  }
}
