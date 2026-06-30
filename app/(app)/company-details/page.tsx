import { createClient } from '@/lib/supabase/server'
import { redirect } from 'next/navigation'
import InvoiceSettingsClient from '@/components/recoverables/settings/InvoiceSettingsClient'

export const dynamic = 'force-dynamic'

export default async function CompanyDetailsTabPage() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/login')

  const { data: settings } = await supabase
    .from('recoverable_invoice_settings')
    .select('*')
    .eq('user_id', user.id)
    .maybeSingle()

  return <InvoiceSettingsClient settings={settings ?? null} hideHeader />
}
