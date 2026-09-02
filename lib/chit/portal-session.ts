// The one helper every portal page uses to find out who is asking.
//
// Kept separate from portal-auth.ts because this touches next/headers, which
// makes a module unusable in a plain unit test. The auth logic stays testable;
// this thin wrapper is the part that talks to the request.

import { cookies } from 'next/headers'
import { redirect } from 'next/navigation'
import { readSession, SESSION_COOKIE, type PortalSession } from './portal-auth'

/** The signed-in member, or null. */
export async function currentPortalSession(): Promise<PortalSession | null> {
  const jar = await cookies()
  return readSession(jar.get(SESSION_COOKIE)?.value)
}

/** The signed-in member, or a redirect. Pages call this and get a member id
 *  they can trust — it came from a cookie we issued, not from the URL. */
export async function requirePortalSession(): Promise<PortalSession> {
  const session = await currentPortalSession()
  if (!session) redirect('/m/closed')
  return session
}
