// The member's own record, as they may see and correct it.

import { requirePortalSession } from '@/lib/chit/portal-session'
import { getProfile } from '@/lib/chit/portal-data'
import PortalProfileForm from '@/components/chit/portal/PortalProfileForm'

export const dynamic = 'force-dynamic'

export default async function PortalProfilePage() {
  // memberId comes from the cookie. Never from the URL.
  const { memberId } = await requirePortalSession()
  const profile = await getProfile(memberId)
  if (!profile) return null
  return <PortalProfileForm profile={profile} />
}
