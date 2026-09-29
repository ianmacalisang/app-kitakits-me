// Kitakits service worker — runtime caching for offline use.
//
// Strategy:
//   - Navigations: network-first, fall back to the cached page, then /offline.html
//   - /_next/static + /icons: cache-first (content-hashed, immutable)
//   - Other same-origin GETs (incl. RSC flight payloads): stale-while-revalidate
//   - Cross-origin: only images are cached (UploadThing/CDN); everything else passes through
//
// Never cached: non-GET requests, Range requests (Bunny/HLS video breaks if
// intercepted), /admin, and /api responses (auth-sensitive REST endpoints).
// Bump VERSION to force a full cache refresh on the next activate.

const VERSION = 'v5'

// Dev hosts — `next dev` chunks under /_next aren't content-hashed, so any
// caching strategy serves stale code after every edit (stale server-action
// references surface as "module factory is not available"). Bypass the worker
// entirely; production builds still get the full caching behavior.
const DEV_HOST =
  self.location.hostname === 'localhost' ||
  self.location.hostname === '127.0.0.1' ||
  self.location.hostname.endsWith('.local') ||
  /^(10\.|192\.168\.|172\.(1[6-9]|2\d|3[01])\.)/.test(self.location.hostname)
const STATIC_CACHE = `kitakits-static-${VERSION}`
const PAGES_CACHE = `kitakits-pages-${VERSION}`
const MEDIA_CACHE = `kitakits-media-${VERSION}`
const ALL_CACHES = [STATIC_CACHE, PAGES_CACHE, MEDIA_CACHE]
const OFFLINE_URL = '/offline.html'

const PRECACHE = [OFFLINE_URL, '/icons/icon-192.png', '/icons/icon-512.png']

// Cross-origin <img> fetches produce 'opaque' responses (status 0) — those are
// still valid to cache; 'error' responses are not.
const isCacheableResponse = (response) =>
  !!response && response.type !== 'error' && (response.type === 'opaque' || response.ok)

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches
      .open(STATIC_CACHE)
      .then((cache) => cache.addAll(PRECACHE))
      .then(() => self.skipWaiting()),
  )
})

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches
      .keys()
      .then((keys) =>
        Promise.all(
          keys
            .filter((key) => key.startsWith('kitakits-') && !ALL_CACHES.includes(key))
            .map((key) => caches.delete(key)),
        ),
      )
      .then(() => self.clients.claim()),
  )
})

const putInCache = async (cacheName, request, response) => {
  if (!isCacheableResponse(response)) return
  const cache = await caches.open(cacheName)
  await cache.put(request, response.clone())
}

const networkFirst = async (request, cacheName, fallbackUrl) => {
  try {
    const response = await fetch(request)
    await putInCache(cacheName, request, response)
    return response
  } catch {
    const cached = await caches.match(request)
    if (cached) return cached
    if (fallbackUrl) {
      const fallback = await caches.match(fallbackUrl)
      if (fallback) return fallback
    }
    return Response.error()
  }
}

const cacheFirst = async (request, cacheName) => {
  const cached = await caches.match(request)
  if (cached) return cached
  const response = await fetch(request)
  await putInCache(cacheName, request, response)
  return response
}

const staleWhileRevalidate = (event, request, cacheName) => {
  const network = fetch(request)
    .then(async (response) => {
      await putInCache(cacheName, request, response)
      return response
    })
    .catch(() => null)

  // Keep the worker alive until the revalidation lands in the cache.
  event.waitUntil(network)

  return caches.match(request).then(async (cached) => {
    if (cached) return cached
    const response = await network
    if (response) return response
    if (request.mode === 'navigate') {
      const fallback = await caches.match(OFFLINE_URL)
      if (fallback) return fallback
    }
    return Response.error()
  })
}

self.addEventListener('fetch', (event) => {
  if (DEV_HOST) return

  const { request } = event

  if (request.method !== 'GET') return
  // Media range requests (video scrubbing, HLS segments) must reach the network.
  if (request.headers.has('range')) return

  const url = new URL(request.url)

  // Next.js prefetches (RSC flight probes) are speculative — they abort all
  // the time, and responding with a network error just logs scary warnings.
  // Let them hit the network directly, untouched.
  if (request.headers.has('next-router-prefetch')) return

  if (url.origin === self.location.origin) {
    // Payload admin and API responses are auth-sensitive — always live.
    if (url.pathname.startsWith('/admin') || url.pathname.startsWith('/api')) return

    if (request.mode === 'navigate') {
      event.respondWith(networkFirst(request, PAGES_CACHE, OFFLINE_URL))
      return
    }

    if (url.pathname.startsWith('/_next/static') || url.pathname.startsWith('/icons')) {
      event.respondWith(cacheFirst(request, STATIC_CACHE))
      return
    }

    // RSC flight payloads and other same-origin GETs.
    event.respondWith(staleWhileRevalidate(event, request, PAGES_CACHE))
    return
  }

  // Cross-origin: cache images only (UploadThing/CDN media). Video streams and
  // anything else go straight to the network.
  if (request.destination === 'image') {
    event.respondWith(staleWhileRevalidate(event, request, MEDIA_CACHE))
  }
})

// The app posts CLEAR_CACHES on logout so cached authed pages can't leak to
// the next user of the device.
self.addEventListener('message', (event) => {
  if (event.data === 'CLEAR_CACHES') {
    event.waitUntil(
      caches.keys().then((keys) => Promise.all(keys.map((key) => caches.delete(key)))),
    )
  }
})
