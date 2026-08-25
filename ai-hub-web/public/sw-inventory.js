// Service Worker — 재물조사 독립 PWA
// /inventory 전용. 앱 셸 + 핵심 에셋을 캐싱해 오프라인에서도 완전히 동작합니다.
// 자산 데이터(dataset JSON)와 사진은 앱이 IndexedDB에 저장하므로 여기서는 캐싱하지 않습니다.

const CACHE = 'inventory-shell-v4'

// 설치 시 캐싱할 앱 셸 파일 (최소한만 — JS 번들은 항상 네트워크에서)
const SHELL = [
  '/manifest-inventory.webmanifest',
  '/pwa-icon.svg',
  '/favicon.svg',
]

// Vite 개발 서버 전용 경로 — SW가 절대 가로채지 않음
function isViteDevPath(pathname) {
  return (
    pathname.startsWith('/@') ||          // /@vite/client, /@react-refresh
    pathname.startsWith('/src/') ||       // /src/inventory-main.tsx 등
    pathname.startsWith('/node_modules/') // /node_modules/.vite/deps/...
  )
}

// ── Install: 앱 셸 사전 캐싱 ─────────────────────────────────────────────────
self.addEventListener('install', (event) => {
  event.waitUntil(
    caches
      .open(CACHE)
      .then((c) => c.addAll(SHELL))
      .then(() => self.skipWaiting()),
  )
})

// ── Activate: 이전 캐시 전체 정리 ────────────────────────────────────────────
self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches
      .keys()
      .then((keys) => Promise.all(keys.filter((k) => k !== CACHE).map((k) => caches.delete(k))))
      .then(() => self.clients.claim()),
  )
})

// ── Fetch: 네트워크 우선, 실패 시 캐시 fallback ──────────────────────────────
self.addEventListener('fetch', (event) => {
  const req = event.request
  if (req.method !== 'GET') return

  const url = new URL(req.url)

  // 외부 도메인(폰트, CDN 등)은 그대로 통과
  if (url.origin !== self.location.origin) return

  // Vite 개발 경로는 SW 가로채기 금지 — 항상 네트워크에서 최신 버전
  if (isViteDevPath(url.pathname)) return

  // 자산 데이터셋은 앱이 직접 처리 (IndexedDB)
  if (url.pathname.startsWith('/datasets/')) return

  // /api 요청: 오프라인이면 그냥 실패하도록 SW에서 개입하지 않음
  if (url.pathname.startsWith('/api/')) return

  // 페이지 내비게이션 → inventory.html로 fallback (SPA 라우팅)
  if (req.mode === 'navigate') {
    event.respondWith(
      fetch(req)
        .then((res) => {
          if (res && res.status === 200) {
            caches.open(CACHE).then((c) => c.put('/inventory.html', res.clone()))
          }
          return res
        })
        .catch(() =>
          caches.match('/inventory.html').then((r) => r || caches.match('/inventory.html')),
        ),
    )
    return
  }

  // JS/CSS/이미지 등: stale-while-revalidate
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
