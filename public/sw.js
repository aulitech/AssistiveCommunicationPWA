// Service worker for offline use.
//
// Someone relying on this app to ask for help cannot be left with a blank page
// because the network dropped, so the goal is: after one successful visit, the
// app opens and works with no connection at all.
//
// Vite fingerprints its build output, so the asset names are not known here at
// author time. Instead of a precache manifest, the strategy is:
//
//   * navigations — network first, fall back to the cached shell
//   * the build's own output, under /assets/ — cache first, refill from the
//     network. Vite writes a hash of each file's contents into its name, so
//     nothing at one of those addresses ever changes
//   * everything else (same-origin) — network first, fall back to the cache
//
// **Cache first is only for an address whose contents cannot change.** The
// manifest, the icons and robots.txt keep one address from release to release,
// and they were served cache first until the app was renamed: an installed copy
// went on calling itself by its old name, because Chrome's check for a new
// manifest was answered out of this cache with the one stored the day the worker
// installed. Nothing short of a new worker would ever have replaced it.

// A new generation, which puts every installed copy on a worker that asks the
// network for the manifest, and takes the cache holding the old one with it.
// Activate deletes every cache that is not this one.
const CACHE = 'peri-v2'
const SHELL = '/index.html'
const PRECACHE = ['/', SHELL, '/manifest.webmanifest', '/icon.svg', '/icon-maskable.svg']

self.addEventListener('install', event => {
  event.waitUntil(
    (async () => {
      const cache = await caches.open(CACHE)
      // Individually, so one 404 cannot fail the whole install.
      await Promise.allSettled(PRECACHE.map(url => cache.add(url)))
      await self.skipWaiting()
    })(),
  )
})

self.addEventListener('activate', event => {
  event.waitUntil(
    (async () => {
      const names = await caches.keys()
      await Promise.all(names.filter(n => n !== CACHE).map(n => caches.delete(n)))
      await self.clients.claim()
    })(),
  )
})

/** Vite's output, whose names carry a hash of what is in them. */
const FINGERPRINTED = '/assets/'

function isCacheable(response) {
  return response && response.status === 200 && response.type === 'basic'
}

/** From the network, kept under `keepAs` for when there is none. */
async function fromNetwork(request, keepAs) {
  const fresh = await fetch(request)
  if (isCacheable(fresh)) {
    const cache = await caches.open(CACHE)
    cache.put(keepAs, fresh.clone())
  }
  return fresh
}

/** The first of these the cache holds, or an error. */
async function fromCache(...keys) {
  const cache = await caches.open(CACHE)
  for (const key of keys) {
    const hit = await cache.match(key)
    if (hit) return hit
  }
  return Response.error()
}

self.addEventListener('fetch', event => {
  const { request } = event
  if (request.method !== 'GET') return

  const url = new URL(request.url)
  if (url.origin !== self.location.origin) return

  // Synchronizing is never cached and never answered from a cache. Everything
  // else served from this origin changes only when the app does, so a copy of
  // it is a fair answer when the network is not there — but this one answers
  // with whatever another device wrote a minute ago. Cached once, a device would
  // be told for ever that its board is what it was this morning, and the failure
  // would look exactly like the feature not working.
  if (url.pathname.startsWith('/api/')) return

  if (request.mode === 'navigate') {
    event.respondWith(fromNetwork(request, SHELL).catch(() => fromCache(SHELL, '/')))
    return
  }

  if (url.pathname.startsWith(FINGERPRINTED)) {
    event.respondWith(
      (async () => {
        const cache = await caches.open(CACHE)
        const hit = await cache.match(request)
        if (hit) return hit
        return fromNetwork(request, request).catch(() => Response.error())
      })(),
    )
    return
  }

  event.respondWith(fromNetwork(request, request).catch(() => fromCache(request)))
})

// Lets the page trigger an immediate update instead of waiting for a reload.
self.addEventListener('message', event => {
  if (event.data === 'skip-waiting') self.skipWaiting()
})
