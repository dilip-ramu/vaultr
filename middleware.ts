import type { NextRequest } from 'next/server'
import { proxy } from './proxy'

/**
 * Wires the Supabase session-refresh + auth-redirect logic (proxy.ts) as
 * Next.js edge middleware, so access tokens refresh on navigation instead of
 * expiring mid-session.
 *
 * The matcher deliberately EXCLUDES `/api` (cron jobs, exchange-rates and any
 * webhook run without a user session and must not be redirected to /login) and
 * static assets. Delete this file to fully revert to per-page auth checks only.
 */
export function middleware(request: NextRequest) {
  return proxy(request)
}

export const config = {
  matcher: [
    '/((?!api|_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp)$).*)',
  ],
}
