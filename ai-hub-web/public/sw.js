// Minimal service worker for the EBS AI 허브 PWA. Enables "install to home screen"
// and offline use of the app shell on Android & iOS. The large asset dataset is
// intentionally NOT cached here — the app already persists it in IndexedDB.
// Paths are relative to this script so the same file works at / and under the
// /user/ and /admin/ portals, each with its own scope and cache.

const SCOPE = new URL('./', self.location).href
const SCOPE_PATH = new URL(SCOPE).pathname
const CACHE = `ai-hub-shell-v4-${SCOPE_PATH}`
const SHELL_URL = SCOPE
const APP_SHELL = ['./', './manifest.webmanifest', './hub-icon-192.png', './favicon.svg']

self.addEventListener('install', (event) => {
  event.waitUntil(caches.open(CACHE).then((c) => c.addAll(APP_SHELL)).then(() => self.skipWaiting()))
})

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches
      .keys()
      .then((keys) => Promise.all(keys.filter((k) => k === 'ai-hub-shell-v1' || k === `ai-hub-shell-v2-${SCOPE_PATH}` || k === `ai-hub-shell-v3-${SCOPE_PATH}`).map((k) => caches.delete(k))))
      .then(() => self.clients.claim()),
  )
})

self.addEventListener('push', (event) => {
  event.waitUntil((async () => {
    let payload = {}
    try { payload = event.data?.json() ?? {} } catch { payload = {} }
    const title = typeof payload.title === 'string' ? payload.title : 'EBS AI HUB'
    const target = new URL(typeof payload.url === 'string' ? payload.url : 'users', SCOPE)
    const safeTarget = target.origin === self.location.origin && target.href.startsWith(SCOPE)
      ? target.href
      : new URL('users', SCOPE).href
    const windows = await self.clients.matchAll({ type: 'window', includeUncontrolled: true })
    for (const client of windows) {
      if (!client.url.startsWith(SCOPE)) continue
      client.postMessage({ type: 'AI_HUB_ADMIN_SIGNUP_PENDING' })
    }
    await self.registration.showNotification(title, {
      body: typeof payload.body === 'string' ? payload.body : '새 알림이 있습니다.',
      icon: new URL('hub-icon-192.png', SCOPE).href,
      badge: new URL('hub-icon-192.png', SCOPE).href,
      data: { url: safeTarget },
    })
  })())
})

self.addEventListener('notificationclick', (event) => {
  event.notification.close()
  const requested = typeof event.notification.data?.url === 'string'
    ? event.notification.data.url
    : new URL('users', SCOPE).href
  const target = new URL(requested, SCOPE)
  const safeTarget = target.origin === self.location.origin && target.href.startsWith(SCOPE)
    ? target.href
    : new URL('users', SCOPE).href
  event.waitUntil((async () => {
    const windows = await self.clients.matchAll({ type: 'window', includeUncontrolled: true })
    for (const client of windows) {
      if (!client.url.startsWith(SCOPE)) continue
      await client.navigate(safeTarget)
      return client.focus()
    }
    return self.clients.openWindow(safeTarget)
  })())
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
