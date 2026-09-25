import { redirect } from 'next/navigation'
import { createClient } from '@/lib/supabase/server'
import { resolveChitAccess } from '@/lib/chit/access'

export default async function Home() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()

  if (!user) redirect('/login')

  // Chit-only staff have no dashboard to go to — sending them there would
  // bounce them straight back out again.
  const access = await resolveChitAccess()
  redirect(access && !access.isOwner ? '/chit' : '/dashboard')
}
