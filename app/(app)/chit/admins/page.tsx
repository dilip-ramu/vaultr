import { redirect } from 'next/navigation'
import { resolveChitAccess, CAN } from '@/lib/chit/access'
import ChitAdminsClient from '@/components/chit/ChitAdminsClient'

export const dynamic = 'force-dynamic'
export const metadata = { title: 'Chit admins — Inex' }

export default async function ChitAdminsPage() {
  const access = await resolveChitAccess()
  if (!access) redirect('/login')
  // An admin must not see the list of admins, let alone edit it.
  if (!CAN.manageAdmins(access.role)) redirect('/chit')
  return <ChitAdminsClient />
}
