// Which URLs belong to the chit member portal.
//
// This lives in its own file, away from proxy.ts, for one reason: proxy.ts
// pulls in @supabase/ssr and next/server the moment it is imported, so it
// cannot be unit tested. This rule decides whether a stranger is allowed
// through the front door, so it gets tested.

export const PORTAL_PREFIX = '/m'

export function isPortalPath(pathname: string): boolean {
  return pathname === PORTAL_PREFIX || pathname.startsWith(PORTAL_PREFIX + '/')
}
