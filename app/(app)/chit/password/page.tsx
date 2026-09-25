import { redirect } from 'next/navigation'
import { resolveChitAccess } from '@/lib/chit/access'
import SetPasswordForm from '@/components/chit/SetPasswordForm'

export const dynamic = 'force-dynamic'
export const metadata = { title: 'Set your password — Inex' }

export default async function ChitPasswordPage() {
  const access = await resolveChitAccess()
  if (!access) redirect('/login')
  return <SetPasswordForm name={access.adminName} forced={access.mustChangePassword} />
}
