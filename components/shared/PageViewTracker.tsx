'use client'

import { useEffect, useRef } from 'react'
import { usePathname } from 'next/navigation'
import { createClient } from '@/lib/supabase/client'

// Fires one row into `page_views` per route change. Fire-and-forget — never
// blocks the UI, never throws. Pure self-telemetry: your data, your DB.
export default function PageViewTracker() {
  const pathname = usePathname()
  const lastPath = useRef<string | null>(null)

  useEffect(() => {
    if (!pathname) return
    if (lastPath.current === pathname) return
    lastPath.current = pathname
    const path = pathname

    // Don't track login / signup / public pages.
    if (path === '/' || path.startsWith('/login') || path.startsWith('/signup')) return

    void (async () => {
      try {
        const supabase = createClient()
        const { data: { user } } = await supabase.auth.getUser()
        if (!user) return
        await supabase.from('page_views').insert({ user_id: user.id, path })
      } catch {
        // Telemetry should never affect the user. Swallow.
      }
    })()
  }, [pathname])

  return null
}
