// Vaultr service worker — lean, mobile-PWA focused.
//
// Strategy:
//   • Static assets (JS, CSS, fonts, icons)  → cache-first, long-lived
//   • Page navigations (HTML)                → network-first, fall back to last cached HTML
//   • API requests (/api/*) + Supabase calls → always network (no caching of user data)
//
// Bump CACHE_VERSION whenever this file changes to evict old caches.

const CACHE_VERSION   = 'vaultr-v1'
const STATIC_CACHE    = `${CACHE_VERSION}-static`
const PAGES_CACHE     = `${CACHE_VERSION}-pages`

// Pre-cache the app icons + manifest so the home-screen launch shows the
// branded splash even on a cold start with no network.
const PRECACHE_URLS = [
  '/manifest.json',
  '/vaultr-icon-192.png',
  '/vaultr-icon-512.png',
  '/vaultr-letter-logo.png',
  '/apple-touch-icon.png',
]

self.addEventListener('install', event => {
  event.waitUntil(
    (async () => {
      const cache = await caches.open(STATIC_CACHE)
      await cache.addAll(PRECACHE_URLS.map(u => new Request(u, { cache: 'reload' })))
      await self.skipWaiting()
    })()
  )
})

self.addEventListener('activate', event => {
  event.waitUntil(
    (async () => {
      const keys = await caches.keys()
      await Promise.all(
        keys
          .filter(k => !k.startsWith(CACHE_VERSION))
          .map(k => caches.delete(k))
      )
      await self.clients.claim()
    })()
  )
})

function isStaticAsset(url) {
  return /\.(js|mjs|css|woff2?|ttf|otf|png|jpg|jpeg|gif|svg|webp|ico)(\?|$)/i.test(url.pathname)
       || url.pathname.startsWith('/_next/static/')
       || url.pathname.startsWith('/fonts/')
}

function isApiOrSupabase(url) {
  if (url.pathname.startsWith('/api/')) return true
  // Supabase REST + Storage + Auth calls — never cache.
  if (url.hostname.endsWith('.supabase.co'))    return true
  if (url.hostname.endsWith('.supabase.in'))    return true
  return false
}

self.addEventListener('fetch', event => {
  const req = event.request

  // Only handle GETs; let other verbs go straight to network.
  if (req.method !== 'GET') return

  const url = new URL(req.url)

  // Never cache user data / API responses — always network.
  if (isApiOrSupabase(url)) return

  // Static assets: cache-first.
  if (isStaticAsset(url)) {
    event.respondWith(
      (async () => {
        const cache = await caches.open(STATIC_CACHE)
        const cached = await cache.match(req)
        if (cached) return cached
        const resp = await fetch(req)
        if (resp.ok) cache.put(req, resp.clone())
        return resp
      })()
    )
    return
  }

  // Page navigations: network-first with cached fallback so the app still
  // opens when offline / on a flaky train signal.
  if (req.mode === 'navigate' || req.headers.get('accept')?.includes('text/html')) {
    event.respondWith(
      (async () => {
        const cache = await caches.open(PAGES_CACHE)
        try {
          const resp = await fetch(req)
          if (resp.ok) cache.put(req, resp.clone())
          return resp
        } catch {
          const cached = await cache.match(req)
          if (cached) return cached
          // Last resort: dashboard if cached, else a stub.
          const dash = await cache.match('/dashboard')
          if (dash) return dash
          return new Response('<h1>Offline</h1><p>Reconnect to load this page.</p>', {
            status: 503,
            headers: { 'Content-Type': 'text/html' },
          })
        }
      })()
    )
  }
})
