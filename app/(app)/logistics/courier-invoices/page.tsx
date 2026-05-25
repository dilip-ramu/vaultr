import { createClient } from '@/lib/supabase/server'
import CourierInvoiceListClient from '@/components/logistics/courier-invoices/CourierInvoiceListClient'
import type { CourierInvoice } from '@/lib/logistics/types'

export const dynamic = 'force-dynamic'

export default async function CourierInvoicesPage() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()

  const [{ data: invoices }, { data: awbs }] = await Promise.all([
    supabase
      .from('courier_invoices')
      .select('*')
      .eq('user_id', user!.id)
      .order('created_at', { ascending: false }),
    supabase
      .from('awbs')
      .select('courier_invoice_id')
      .eq('user_id', user!.id),
  ])

  // Count AWBs per invoice
  const awbCounts: Record<string, number> = {}
  for (const awb of awbs ?? []) {
    awbCounts[awb.courier_invoice_id] = (awbCounts[awb.courier_invoice_id] ?? 0) + 1
  }

  return (
    <CourierInvoiceListClient
      invoices={(invoices ?? []) as CourierInvoice[]}
      awbCounts={awbCounts}
    />
  )
}
