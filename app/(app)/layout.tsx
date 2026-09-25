import { redirect } from 'next/navigation'
import { headers } from 'next/headers'
import { createClient } from '@/lib/supabase/server'
import AppShell from '@/components/AppShell'
import { BalanceProvider } from '@/components/shared/BalanceVisibility'
import { resolveChitAccess } from '@/lib/chit/access'

export default async function AppLayout({ children }: { children: React.ReactNode }) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()

  if (!user) {
    redirect('/login')
  }

  /**
   * CHIT-ONLY ADMINS (v120).
   *
   * An admin signs in as themselves and is granted access to one owner's
   * CHIT data. Everything else in Inex is not theirs to see, and — because the
   * other tables keep their owner-only policies — would render empty anyway.
   * An empty Payroll page invites a bug report; a redirect states the rule.
   *
   * This is the LAST line of defence, not the only one: the database refuses
   * the data regardless of which URL they reach.
   */
  const access = await resolveChitAccess()
  const isChitOnly = access != null && !access.isOwner
  if (isChitOnly) {
    // proxy.ts sets this header; it does no auth work. If it were ever missing we
    // would not redirect — and the database would still refuse every non-chit
    // row to an admin session, so the failure is a confusing empty page rather
    // than a leak.
    const path = (await headers()).get('x-pathname') ?? ''
    // The owner chose this account's first password, so until it is replaced
    // somebody other than the account holder knows it. Nothing else opens
    // until they set their own.
    if (access!.mustChangePassword && path !== '/chit/password') redirect('/chit/password')
    if (path && !path.startsWith('/chit')) redirect('/chit')
  }

  const { data: profile } = await supabase
    .from('profiles')
    .select('*')
    .eq('id', user.id)
    .single()

  return (
    <BalanceProvider>
      <AppShell user={user} profile={profile} chitOnly={isChitOnly} adminName={access?.adminName ?? null}>
        {children}
      </AppShell>
    </BalanceProvider>
  )
}
