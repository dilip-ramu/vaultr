import { notFound } from 'next/navigation'
import { requirePortalSession } from '@/lib/chit/portal-session'
import { getGroupDetail } from '@/lib/chit/portal-data'
import PortalGroup from '@/components/chit/portal/PortalGroup'

export const dynamic = 'force-dynamic'

export default async function PortalGroupPage({
  params,
}: { params: Promise<{ groupId: string }> }) {
  const { memberId } = await requirePortalSession()
  const { groupId } = await params
  // The group id is from the URL, so it is untrusted. getGroupDetail checks it
  // against this member's own memberships and returns null for anything else —
  // a group they are not in is indistinguishable from a group that does not
  // exist, which is the correct thing to leak: nothing.
  const detail = await getGroupDetail(memberId, groupId)
  if (!detail) notFound()
  return <PortalGroup detail={detail} />
}
