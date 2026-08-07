// Service worker for offline use.
//
// Someone relying on this app to ask for help cannot be left with a blank page
// because the network dropped, so the goal is: after one successful visit, the
// app opens and works with no connection at all.
//
// Vite fingerprints its build output, so the asset names are not known here at
// author time. Instead of a precache manifest, the strategy is:
//
//   * navigations  — network first, fall back to the cached shell
//   * everything else (same-origin) — cache first, refill from the network
//
// Bump CACHE to force clients onto a new generation.

// Renamed from `dwellspeak-v1`, which doubles as the generation bump the icon
// change needs: assets are served cache-first, so an installed copy would
// otherwise keep the old mark indefinitely. Activate deletes every cache that
// is not this one.
const CACHE = 'peri-v1'
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

function isCacheable(response) {
  return response && response.status === 200 && response.type === 'basic'
}

self.addEventListener('fetch', event => {
  const { request } = event
  if (request.method !== 'GET') return

  const url = new URL(request.url)
  if (url.origin !== self.location.origin) return

  if (request.mode === 'navigate') {
    event.respondWith(
      (async () => {
        try {
          const fresh = await fetch(request)
          if (isCacheable(fresh)) {
            const cache = await caches.open(CACHE)
            cache.put(SHELL, fresh.clone())
          }
          return fresh
        } catch {
          const cache = await caches.open(CACHE)
          return (await cache.match(SHELL)) ?? (await cache.match('/')) ?? Response.error()
        }
      })(),
    )
    return
  }

  event.respondWith(
    (async () => {
      const cache = await caches.open(CACHE)
      const hit = await cache.match(request)
      if (hit) return hit
      try {
        const fresh = await fetch(request)
        if (isCacheable(fresh)) cache.put(request, fresh.clone())
        return fresh
      } catch {
        return Response.error()
      }
    })(),
  )
})

// Lets the page trigger an immediate update instead of waiting for a reload.
self.addEventListener('message', event => {
  if (event.data === 'skip-waiting') self.skipWaiting()
})
