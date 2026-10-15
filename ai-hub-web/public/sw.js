// Minimal service worker for the EBS AI 허브 PWA. Enables "install to home screen"
// and offline use of the app shell on Android & iOS. The large asset dataset is
// intentionally NOT cached here — the app already persists it in IndexedDB.
// Paths are relative to this script so the same file works at / and under the
// /user/ and /admin/ portals, each with its own scope and cache.

const SCOPE = new URL('./', self.location).href
const CACHE = `ai-hub-shell-v2-${new URL(SCOPE).pathname}`
const SHELL_URL = SCOPE
const APP_SHELL = ['./', './manifest.webmanifest', './hub-icon-192.png', './favicon.svg']

self.addEventListener('install', (event) => {
  event.waitUntil(caches.open(CACHE).then((c) => c.addAll(APP_SHELL)).then(() => self.skipWaiting()))
})

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches
      .keys()
      // Only drop the old shared v1 cache; v2 caches belong to their own portal scopes.
      .then((keys) => Promise.all(keys.filter((k) => k === 'ai-hub-shell-v1').map((k) => caches.delete(k))))
      .then(() => self.clients.claim()),
  )
})

self.addEventListener('fetch', (event) => {
  const req = event.request
  if (req.method !== 'GET') return
  const url = new URL(req.url)
  if (url.origin !== self.location.origin) return // let fonts/CDNs go to network
  if (!url.href.startsWith(SCOPE)) return // other portals or the inventory app
  if (url.pathname.includes('/datasets/') || url.pathname.includes('/api/')) return // handled by app + IndexedDB

  // Navigations: network-first so updates load when online, cache fallback offline.
  if (req.mode === 'navigate') {
    event.respondWith(
      fetch(req)
        .then((res) => {
          if (res && res.ok) {
            const copy = res.clone()
            caches.open(CACHE).then((c) => c.put(SHELL_URL, copy))
          }
          return res
        })
        .catch(() => caches.match(SHELL_URL)),
    )
    return
  }

  // Other same-origin assets: stale-while-revalidate.
  event.respondWith(
    caches.match(req).then((cached) => {
      const network = fetch(req)
        .then((res) => {
          if (res && res.status === 200) {
            const copy = res.clone()
            caches.open(CACHE).then((c) => c.put(req, copy))
          }
          return res
        })
        .catch(() => cached)
      return cached || network
    }),
  )
})
