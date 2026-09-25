import { redirect } from 'next/navigation'
import { resolveChitAccess, CAN } from '@/lib/chit/access'
import ChitStaffClient from '@/components/chit/ChitStaffClient'

export const dynamic = 'force-dynamic'
export const metadata = { title: 'Chit staff — Inex' }

export default async function ChitStaffPage() {
  const access = await resolveChitAccess()
  if (!access) redirect('/login')
  // Staff must not see the list of staff, let alone edit it.
  if (!CAN.manageStaff(access.role)) redirect('/chit')
  return <ChitStaffClient />
}
