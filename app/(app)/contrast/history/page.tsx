import { createClient } from '@/lib/supabase/server'
import ContrastHistoryClient from '@/components/contrast/ContrastHistoryClient'

export const dynamic = 'force-dynamic'

export default async function ContrastHistoryPage() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()

  const { data: invoices } = await supabase
    .from('contrast_invoices')
    .select('*, items:contrast_invoice_items(*)')
    .eq('user_id', user!.id)
    .order('invoice_month', { ascending: false })

  return <ContrastHistoryClient invoices={(invoices ?? []) as never[]} />
}
