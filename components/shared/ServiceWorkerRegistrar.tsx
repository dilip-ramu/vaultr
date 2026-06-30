'use client'

import { useEffect } from 'react'

// Registers the service worker at /sw.js. Silent — never affects UX. The SW
// caches static assets and falls back to a cached page when offline. User
// data (API + Supabase) is always fetched fresh.
export default function ServiceWorkerRegistrar() {
  useEffect(() => {
    if (typeof window === 'undefined') return
    if (!('serviceWorker' in navigator)) return
    // Only register in production builds — avoids dev-time stale-cache pain.
    if (process.env.NODE_ENV !== 'production') return

    const onLoad = () => {
      navigator.serviceWorker
        .register('/sw.js', { scope: '/' })
        .catch(() => { /* silent */ })
    }
    if (document.readyState === 'complete') onLoad()
    else window.addEventListener('load', onLoad, { once: true })
  }, [])

  return null
}
