import { requirePortalSession } from '@/lib/chit/portal-session'
import { getMember, getGroups } from '@/lib/chit/portal-data'
import PortalHome from '@/components/chit/portal/PortalHome'

export const dynamic = 'force-dynamic'

export default async function PortalHomePage() {
  // memberId comes from the cookie. Never from the URL.
  const { memberId } = await requirePortalSession()
  const [member, groups] = await Promise.all([getMember(memberId), getGroups(memberId)])
  if (!member) return null
  return <PortalHome member={member} groups={groups} />
}
