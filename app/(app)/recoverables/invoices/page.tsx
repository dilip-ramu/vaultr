import { createClient } from '@/lib/supabase/server'
import { redirect } from 'next/navigation'
import InvoiceListClient from '@/components/recoverables/invoices/InvoiceListClient'
import type { RecoverableInvoice } from '@/lib/recoverables/types'

export default async function InvoicesPage() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/login')

  const { data: invoices } = await supabase
    .from('recoverable_invoices')
    .select('*')
    .eq('user_id', user.id)
    .order('created_at', { ascending: false })

  return (
    <InvoiceListClient invoices={(invoices ?? []) as RecoverableInvoice[]} />
  )
}
