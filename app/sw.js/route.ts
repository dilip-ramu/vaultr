import { NextResponse } from 'next/server'

/**
 * /sw.js — served as a route handler (was public/sw.js) so we can bake the
 * Vercel commit SHA into CACHE_VERSION at build time. Before this change, the
 * version was hardcoded to 'vaultr-v1' and never bumped, so iOS PWA users kept
 * eating stale bundles after every deploy — that's the flavour of ghost bug
 * behind past "salaries gone" / "wrong currency symbol" reports.
 *
 * Every new deploy on Vercel gets a fresh SHA → the SW cache namespace
 * changes → the old caches are pruned in `activate`. Local dev falls back to
 * a timestamp so hot reloads work.
 */
export const dynamic = 'force-static'
export const revalidate = false

const CACHE_VERSION =
  process.env.VERCEL_GIT_COMMIT_SHA?.slice(0, 12) ??
  `dev-${Date.now()}`

// Service-worker body. Keep this in sync with the old public/sw.js — only
// change here is the injected CACHE_VERSION and the header comment.
const SW = `// Vaultr service worker — lean, mobile-PWA focused.
//
// Strategy:
//   • Static assets (JS, CSS, fonts, icons)  → cache-first, long-lived
//   • Page navigations (HTML)                → network-first, fall back to last cached HTML
//   • API requests (/api/*) + Supabase calls → always network (no caching of user data)
//
// CACHE_VERSION is baked in from VERCEL_GIT_COMMIT_SHA at build time — every
// deploy invalidates all caches automatically. Do NOT hand-edit that string.

const CACHE_VERSION   = '${CACHE_VERSION}'
const STATIC_CACHE    = \`\${CACHE_VERSION}-static\`
const PAGES_CACHE     = \`\${CACHE_VERSION}-pages\`

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
  return /\\.(js|mjs|css|woff2?|ttf|otf|png|jpg|jpeg|gif|svg|webp|ico)(\\?|$)/i.test(url.pathname)
       || url.pathname.startsWith('/_next/static/')
       || url.pathname.startsWith('/fonts/')
}

function isApiOrSupabase(url) {
  if (url.pathname.startsWith('/api/')) return true
  if (url.hostname.endsWith('.supabase.co'))    return true
  if (url.hostname.endsWith('.supabase.in'))    return true
  return false
}

self.addEventListener('fetch', event => {
  const req = event.request
  if (req.method !== 'GET') return
  const url = new URL(req.url)
  if (isApiOrSupabase(url)) return

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
`

export function GET() {
  return new NextResponse(SW, {
    status: 200,
    headers: {
      'Content-Type':          'application/javascript; charset=utf-8',
      // Ensure the browser fetches a fresh copy on every navigation — the SW
      // itself is what invalidates the caches, so it MUST NOT be cached.
      'Cache-Control':         'no-store, no-cache, must-revalidate',
      'Service-Worker-Allowed': '/',
    },
  })
}
