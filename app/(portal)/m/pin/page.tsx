import { requirePortalSession } from '@/lib/chit/portal-session'
import { getMember } from '@/lib/chit/portal-data'
import PortalPinForm from '@/components/chit/portal/PortalPinForm'

export const dynamic = 'force-dynamic'

export default async function PortalPinPage() {
  const { memberId } = await requirePortalSession()
  const member = await getMember(memberId)
  return <PortalPinForm name={member?.name ?? ''} />
}
